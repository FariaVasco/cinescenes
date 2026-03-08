#!/usr/bin/env node
/**
 * Cinescenes — Trailer Safe-Zone Scanner
 *
 * For a given movie, fetches its official trailer from TMDb (preferring
 * studio / distributor uploads), transcribes the audio with OpenAI Whisper,
 * and identifies the longest spoiler-free window (≤ 60 s) to store as
 * safe_start / safe_end in the database.
 *
 * Requirements:
 *   brew install yt-dlp ffmpeg            # video/audio extraction
 *   TMDB_API_KEY    in .env               # https://developer.themoviedb.org
 *   GROQ_API_KEY    in .env               # https://console.groq.com
 *   SUPABASE_SERVICE_KEY in .env          # Supabase project → Settings → API (service_role)
 *
 * Usage:
 *   node scripts/scan-trailer.js --movie "The Godfather" --year 1972
 *   node scripts/scan-trailer.js --tmdb-id 238
 *   node scripts/scan-trailer.js --youtube-id dC1yHLp9bWA \
 *       --title "The Godfather" --year 1972 --director "Francis Ford Coppola"
 *
 *   Add --update to write safe_start / safe_end back to Supabase.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const OpenAI = require('openai').default ?? require('openai');
const { createClient } = require('@supabase/supabase-js');

// ── Constants ─────────────────────────────────────────────────────────────────

const TMDB_BASE          = 'https://api.themoviedb.org/3';
const FRAMES_FPS         = 1;     // 1 frame every 1s — catches short title cards
const MAX_CLIP_S         = 60;    // max safe window length (seconds)
const MIN_CLIP_S         = 30;    // minimum useful window
const BUFFER_S           = 2;     // seconds of padding around flagged segments
const VISION_MODEL       = 'meta-llama/llama-4-scout-17b-16e-instruct';
const VISION_DELAY_MS    = 500;   // delay between vision API calls (raise if hitting rate limits)
const ENV_FILE           = path.join(__dirname, '../.env');

// Known major studio / distributor channel keywords — trailers from these
// channels almost never have pre-roll ads and start immediately.
const OFFICIAL_KEYWORDS = [
  'warner', 'universal', 'paramount', 'sony', 'disney', 'marvel',
  'a24', 'lionsgate', 'miramax', 'mgm', 'dreamworks', 'fox',
  'netflix', 'apple', 'amazon', 'neon', 'searchlight', 'focus features',
  'annapurna', 'new line', 'columbia',
];

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) { console.error('No .env at project root'); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseCli() {
  const args = process.argv.slice(2);
  const get  = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  return {
    movie:      get('--movie')      || get('--title'),
    year:       get('--year')       ? parseInt(get('--year'), 10) : null,
    tmdbId:     get('--tmdb-id')    ? parseInt(get('--tmdb-id'), 10) : null,
    youtubeId:  get('--youtube-id'),
    director:   get('--director'),
    update:     args.includes('--update'),
  };
}

// ── TMDb helpers ──────────────────────────────────────────────────────────────

async function tmdb(path, apiKey) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${apiKey}`);
  if (!res.ok) throw new Error(`TMDb ${res.status}: ${path}`);
  return res.json();
}

async function findTmdbMovie(title, year, apiKey) {
  const q = encodeURIComponent(title);
  const yearParam = year ? `&year=${year}` : '';
  const data = await tmdb(`/search/movie?query=${q}${yearParam}&language=en-US`, apiKey);
  if (!data.results?.length) return null;
  // Prefer exact year match, then most popular
  const sorted = data.results.sort((a, b) => {
    const ay = a.release_date?.slice(0, 4);
    const by = b.release_date?.slice(0, 4);
    const aMatch = year ? (ay == year ? 0 : 1) : 0;
    const bMatch = year ? (by == year ? 0 : 1) : 0;
    return aMatch - bMatch || b.popularity - a.popularity;
  });
  return sorted[0];
}

async function getTmdbMovieDetails(tmdbId, apiKey) {
  return tmdb(`/movie/${tmdbId}?language=en-US`, apiKey);
}

async function getTmdbMovieCredits(tmdbId, apiKey) {
  return tmdb(`/movie/${tmdbId}/credits?language=en-US`, apiKey);
}

async function getTmdbPersonCredits(personId, apiKey) {
  return tmdb(`/person/${personId}/movie_credits?language=en-US`, apiKey);
}

async function getTmdbCollection(collectionId, apiKey) {
  return tmdb(`/collection/${collectionId}?language=en-US`, apiKey);
}

/**
 * Fetch official trailers from TMDb, ranked by studio-channel preference.
 * Returns an array of { name, youtubeId, quality, official, publishedAt }
 */
async function getOfficialTrailers(tmdbId, apiKey) {
  const data = await tmdb(`/movie/${tmdbId}/videos?language=en-US`, apiKey);
  const videos = data.results ?? [];

  return videos
    .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
    .map(v => ({
      name:        v.name,
      youtubeId:   v.key,
      quality:     v.size,        // 1080, 720, 480 …
      official:    v.official,
      publishedAt: v.published_at,
    }))
    .sort((a, b) => {
      // 1. Official first
      if (a.official !== b.official) return a.official ? -1 : 1;
      // 2. Oldest publish date first (original theatrical trailer beats re-releases)
      return new Date(a.publishedAt) - new Date(b.publishedAt);
    });
}

// ── yt-dlp helpers ────────────────────────────────────────────────────────────

function checkYtDlp() {
  const result = spawnSync('which', ['yt-dlp']);
  if (result.status !== 0) {
    console.error('\n❌  yt-dlp not found. Install it with:\n    brew install yt-dlp\n');
    process.exit(1);
  }
}

const YTDLP_COOKIE_ARGS = ['--cookies-from-browser', 'safari'];

function getVideoInfo(youtubeUrl) {
  const result = spawnSync('yt-dlp', ['--dump-json', '--no-playlist', ...YTDLP_COOKIE_ARGS, youtubeUrl], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) throw new Error(`yt-dlp info failed: ${result.stderr}`);
  const info = JSON.parse(result.stdout);
  return {
    duration:    info.duration,         // seconds
    title:       info.title,
    channelName: info.channel ?? info.uploader,
  };
}

function downloadVideo(youtubeUrl, outputPath) {
  // Lowest-quality video (≤480p mp4) — needed for both audio transcription and frame analysis
  const result = spawnSync('yt-dlp', [
    '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    ...YTDLP_COOKIE_ARGS,
    '-o', outputPath,
    youtubeUrl,
  ], { encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`yt-dlp download failed:\n${result.stderr}`);
}

function extractAudio(videoPath, audioPath) {
  const result = spawnSync('ffmpeg', [
    '-i', videoPath,
    '-q:a', '5',
    '-map', 'a',
    audioPath,
    '-y',
  ], { encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`ffmpeg audio extract failed:\n${result.stderr}`);
}

/**
 * Extract frames from the entire video at FRAMES_FPS.
 * Scans the full trailer to catch title cards that appear mid-video
 * (e.g. "Director of The Dark Knight" at 0:45 in a 2:30 trailer).
 * Returns [{framePath, timestamp}] sorted by timestamp.
 */
function extractFullVideoFrames(videoPath, framesDir) {
  fs.mkdirSync(framesDir, { recursive: true });

  spawnSync('ffmpeg', [
    '-i',  videoPath,
    '-vf', `fps=${FRAMES_FPS}`,
    `${framesDir}/frame_%05d.jpg`,
    '-y',
  ], { encoding: 'utf-8' });

  const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
  return files.map((f, i) => ({
    framePath: path.join(framesDir, f),
    timestamp: i / FRAMES_FPS,
  }));
}

// ── Groq Vision ───────────────────────────────────────────────────────────────

/**
 * Analyse each frame with a vision LLM (Groq llama-3.2-vision).
 * Asks the model to transcribe all visible text, then matches against the
 * spoiler word list with the same regex logic used for audio.
 * Returns flagged intervals in the same shape as audio flagged intervals.
 */
async function detectVisualSpoilers(frames, spoilerWords, groq) {
  const regexes = buildSpoilerRegexes(spoilerWords);
  const flagged = [];

  for (const { framePath, timestamp } of frames) {
    const imageB64 = fs.readFileSync(framePath).toString('base64');

    try {
      const response = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageB64}` },
            },
            {
              type: 'text',
              text: 'Transcribe ALL text visible in this image, including title cards, logos, subtitles, and any stylized or decorative text. Reply with ONLY the visible text exactly as it appears. If no text is visible, reply with "NONE".',
            },
          ],
        }],
        max_tokens:  150,
        temperature: 0,
      });

      let text = (response.choices[0]?.message?.content ?? '').trim();
      // Strip common model preambles ("The visible text is:", "The text in the image is:", etc.)
      text = text.replace(/^(the\s+)?(visible\s+)?text\s+(in\s+(the|this)\s+image\s+)?is\s*:\s*/i, '').trim();
      // Skip frames with no text (model may reply "NONE", "None", "No text", etc.)
      if (!text || /^(none|no\s+text|nothing|no\s+visible\s+text)/i.test(text)) continue;

      const matched = regexes.filter(({ regex }) => regex.test(text)).map(({ word }) => word);
      if (matched.length > 0) {
        flagged.push({
          start:   timestamp,
          end:     timestamp + 1 / FRAMES_FPS,
          text:    text.replace(/\n/g, ' ').slice(0, 120),
          matched,
        });
      }
    } catch (e) {
      console.warn(`    ⚠️  Vision API error at ${fmt(timestamp)}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, VISION_DELAY_MS));
  }

  return flagged;
}

// ── Groq Whisper ──────────────────────────────────────────────────────────────

async function transcribeAudio(audioPath, groq) {
  const fileSizeMB = fs.statSync(audioPath).size / 1_000_000;
  if (fileSizeMB > 25) {
    throw new Error(`Audio file too large for Groq Whisper (${fileSizeMB.toFixed(1)} MB > 25 MB)`);
  }

  const response = await groq.audio.transcriptions.create({
    file:                      fs.createReadStream(audioPath),
    model:                     'whisper-large-v3-turbo',
    response_format:           'verbose_json',
    timestamp_granularities:   ['segment'],
  });

  // verbose_json returns { segments: [{ start, end, text }] }
  return response.segments ?? [];
}

// ── Spoiler detection ─────────────────────────────────────────────────────────

/**
 * Build a set of "spoiler words" to flag in the transcript.
 * Filters out common English stop-words to avoid false positives.
 *
 * When tmdbId + apiKey are supplied, also enriches with indirect references:
 *  - Other films directed by the same director(s)
 *  - Franchise / collection entries (e.g. all Bond films, all Marvel sequels)
 */
async function buildSpoilerWords(title, director, year, tmdbId, apiKey) {
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for',
    'and', 'or', 'but', 'is', 'it', 'its', 'be', 'by', 'as', 'at', 'this',
    'that', 'with', 'from', 'into', 'was', 'are', 'not']);

  // Extended stop list for enrichment-derived words — adds common English nouns
  // and adjectives that appear in film titles but match normal dialogue/review text.
  const ENRICH_STOP = new Set([...STOP,
    'about', 'after', 'again', 'against', 'back', 'been', 'before', 'between',
    'black', 'blood', 'blue', 'city', 'come', 'could', 'days', 'dead', 'dear',
    'death', 'does', 'done', 'down', 'each', 'earth', 'even', 'every', 'eyes',
    'face', 'fire', 'first', 'force', 'found', 'girl', 'goes', 'gold', 'good',
    'great', 'green', 'have', 'heart', 'here', 'high', 'home', 'hope', 'house',
    'just', 'keep', 'kill', 'know', 'land', 'last', 'late', 'left', 'life',
    'light', 'like', 'line', 'little', 'live', 'long', 'look', 'love', 'made',
    'make', 'more', 'most', 'much', 'must', 'name', 'need', 'next', 'night',
    'only', 'open', 'over', 'part', 'past', 'people', 'place', 'plan', 'play',
    'power', 'rain', 'real', 'right', 'road', 'rock', 'same', 'says', 'seen',
    'side', 'some', 'soon', 'soul', 'star', 'stay', 'still', 'stone', 'stop',
    'such', 'take', 'tell', 'them', 'then', 'there', 'they', 'thing', 'think',
    'time', 'told', 'town', 'turn', 'under', 'very', 'want', 'ways', 'well',
    'went', 'were', 'what', 'when', 'where', 'which', 'while', 'white', 'will',
    'without', 'woman', 'words', 'work', 'world', 'year', 'years', 'young', 'your',
  ]);

  const words = new Set();

  // Core words (title, director, year): minimal filtering — keep short distinctive
  // words like "ford", "dark", "alien", "back"
  const addCore = (phrase) => {
    if (!phrase) return;
    phrase.toLowerCase().split(/[\s\-_,.:]+/)
      .filter(w => w.length > 2 && !STOP.has(w))
      .forEach(w => words.add(w));
  };

  // Enrichment words (filmography, collections): require 5+ chars AND exclude
  // common English words to prevent false positives in dialogue / review text
  const addEnrichment = (phrase) => {
    if (!phrase) return;
    phrase.toLowerCase().split(/[\s\-_,.:]+/)
      .filter(w => w.length > 4 && !ENRICH_STOP.has(w))
      .forEach(w => words.add(w));
  };

  addCore(title);
  addCore(director);
  if (year) {
    words.add(String(year));
    // Common spoken forms: "nineteen seventy-two", "two thousand and three"
    words.add(String(year).slice(2)); // e.g. "72" from 1972
  }

  // ── Indirect spoiler enrichment via TMDb ──────────────────────────────────
  if (tmdbId && apiKey) {
    try {
      // 1. Director filmography — other films they directed identify the director
      const credits = await getTmdbMovieCredits(tmdbId, apiKey);
      const directors = (credits.crew ?? []).filter(c => c.job === 'Director');

      for (const dir of directors) {
        addCore(dir.name); // in case director wasn't passed in
        try {
          const personCredits = await getTmdbPersonCredits(dir.id, apiKey);
          for (const film of (personCredits.crew ?? [])) {
            if (film.job === 'Director' && film.title && film.id !== tmdbId) {
              addEnrichment(film.title);
            }
          }
        } catch {}
      }

      // 2. Franchise / collection — other entries give away the series name
      const details = await getTmdbMovieDetails(tmdbId, apiKey);
      const collection = details.belongs_to_collection;
      if (collection) {
        addEnrichment(collection.name);
        try {
          const col = await getTmdbCollection(collection.id, apiKey);
          for (const part of (col.parts ?? [])) {
            if (part.id !== tmdbId) addEnrichment(part.title);
          }
        } catch {}
      }
    } catch (e) {
      console.warn(`    ⚠️  Extended spoiler enrichment failed: ${e.message}`);
    }
  }

  return words;
}

// Pre-compile a word-boundary regex for each spoiler word so that e.g.
// "war" doesn't match inside "warning" or "award".
function buildSpoilerRegexes(spoilerWords) {
  return [...spoilerWords].map(w => ({
    word:  w,
    regex: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));
}

function findFlaggedIntervals(segments, spoilerWords) {
  const regexes = buildSpoilerRegexes(spoilerWords);
  const flagged = [];

  for (const seg of segments) {
    const matched = regexes.filter(({ regex }) => regex.test(seg.text)).map(({ word }) => word);
    if (matched.length > 0) {
      flagged.push({
        start:   seg.start,
        end:     seg.end,
        text:    seg.text.trim(),
        matched,
      });
    }
  }

  return flagged;
}

// ── Vision verification pass ──────────────────────────────────────────────────

const VERIFY_FPS = 1;   // 1 frame/s — 2× denser than the full-scan to catch short title cards

/**
 * Re-scans the candidate safe window with the Vision LLM at VERIFY_FPS (1fps).
 *
 * The full-video scan runs at 0.5fps (1 frame every 2s).  A title card visible
 * for ~1.5s can fall entirely between two sample points and be missed.
 * Running the Vision LLM on the shorter, already-selected window at 1fps ensures
 * every 1s+ title card is seen, without the cost of re-scanning the whole trailer.
 *
 * Each call clears and recreates verifyFramesDir so stale frames from a
 * previous iteration never pollute the results.
 *
 * Returns flagged intervals in the same shape as audio/visual flags.
 */
async function verifyWindowWithVision(videoPath, windowStart, windowEnd, verifyFramesDir, spoilerWords, groq) {
  // Clear stale frames from any previous iteration
  try { fs.rmSync(verifyFramesDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(verifyFramesDir, { recursive: true });

  spawnSync('ffmpeg', [
    '-ss', String(windowStart),
    '-to', String(windowEnd),
    '-i',  videoPath,
    '-vf', `fps=${VERIFY_FPS}`,
    `${verifyFramesDir}/verify_%05d.jpg`,
    '-y',
  ], { encoding: 'utf-8' });

  const files = fs.readdirSync(verifyFramesDir)
    .filter(f => f.startsWith('verify_') && f.endsWith('.jpg'))
    .sort();

  const frames = files.map((f, i) => ({
    framePath: path.join(verifyFramesDir, f),
    timestamp: windowStart + i / VERIFY_FPS,
  }));

  return detectVisualSpoilers(frames, spoilerWords, groq);
}

// ── Safe window algorithm ─────────────────────────────────────────────────────

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (const [s, e] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/**
 * Forward-scanning safe window algorithm.
 *
 * Starts at T=0 and tries to accumulate MAX_CLIP_S (60s) of clean time.
 * When a spoiler is hit, resets the counter past it and tries again.
 * Falls back to the first gap ≥ MIN_CLIP_S (30s) if no 60s window exists.
 */
function findSafeWindow(totalDuration, flaggedIntervals) {
  // Expand each flagged segment by BUFFER_S on both sides and merge overlaps
  const buffered = flaggedIntervals.map(f => [
    Math.max(0, f.start - BUFFER_S),
    Math.min(totalDuration, f.end + BUFFER_S),
  ]);
  const blocked = mergeIntervals(buffered);

  // Forward scan: start at 0, advance past each blocked region.
  // Return as soon as a MAX_CLIP_S-wide clean gap is found.
  let pos = 0;
  for (const [bs, be] of blocked) {
    if (bs >= pos + MAX_CLIP_S) {
      // Clean gap of ≥ 60s found starting at pos — stop here
      return { start: Math.round(pos), end: Math.round(pos + MAX_CLIP_S), len: MAX_CLIP_S };
    }
    if (be > pos) pos = be; // skip past this spoiler block
  }
  // Check the tail after the last blocked region
  if (totalDuration - pos >= MAX_CLIP_S) {
    return { start: Math.round(pos), end: Math.round(pos + MAX_CLIP_S), len: MAX_CLIP_S };
  }

  // Fallback: find the first clean gap ≥ MIN_CLIP_S (30s)
  pos = 0;
  for (const [bs, be] of blocked) {
    const gapLen = bs - pos;
    if (gapLen >= MIN_CLIP_S) {
      const len = Math.min(gapLen, MAX_CLIP_S);
      return { start: Math.round(pos), end: Math.round(pos + len), len: Math.round(len) };
    }
    if (be > pos) pos = be;
  }
  const remaining = totalDuration - pos;
  if (remaining >= MIN_CLIP_S) {
    const len = Math.min(remaining, MAX_CLIP_S);
    return { start: Math.round(pos), end: Math.round(pos + len), len: Math.round(len) };
  }

  return null;
}

// ── Supabase write ────────────────────────────────────────────────────────────

async function updateDatabase(movieTitle, movieYear, movieDirector, youtubeId, safeStart, safeEnd, env) {
  const serviceKey = env['SUPABASE_SERVICE_KEY'];
  if (!serviceKey || serviceKey.startsWith('your_')) {
    throw new Error('SUPABASE_SERVICE_KEY not set in .env');
  }
  const supabase = createClient(env['EXPO_PUBLIC_SUPABASE_URL'], serviceKey);

  // Try updating an existing row first
  const { data: updated, error: updateError } = await supabase
    .from('movies')
    .update({ youtube_id: youtubeId, safe_start: safeStart, safe_end: safeEnd, active: true })
    .ilike('title', movieTitle)
    .eq('year', movieYear)
    .select('id, title, year');

  if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);

  if (updated?.length) return { ...updated[0], inserted: false };

  // Row doesn't exist yet — insert it
  const { data: inserted, error: insertError } = await supabase
    .from('movies')
    .insert({ title: movieTitle, year: movieYear, director: movieDirector ?? null,
              youtube_id: youtubeId, safe_start: safeStart, safe_end: safeEnd, active: true })
    .select('id, title, year');

  if (insertError) throw new Error(`Supabase insert failed: ${insertError.message}`);
  return { ...inserted[0], inserted: true };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cli = parseCli();
  const env = loadEnv();

  // Validate required env keys
  const tmdbKey  = env['TMDB_API_KEY'];
  const groqKey  = env['GROQ_API_KEY'];
  if (!tmdbKey || tmdbKey.startsWith('your_')) { console.error('❌  TMDB_API_KEY not set in .env'); process.exit(1); }
  if (!groqKey || groqKey.startsWith('your_')) { console.error('❌  GROQ_API_KEY not set in .env'); process.exit(1); }

  checkYtDlp();

  const groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });

  // ── Step 1: Resolve movie metadata ─────────────────────────────────────────

  let movieTitle, movieYear, movieDirector, youtubeId, trailerName, channelName, tmdbId;

  if (cli.youtubeId) {
    // Manual YouTube ID provided — use supplied metadata
    if (!cli.movie || !cli.year) {
      console.error('❌  --youtube-id requires --movie and --year too');
      process.exit(1);
    }
    youtubeId     = cli.youtubeId;
    movieTitle    = cli.movie;
    movieYear     = cli.year;
    movieDirector = cli.director;
    trailerName   = 'Manual';
    channelName   = 'Manual';
    console.log(`\n🎬  Using provided YouTube ID: ${youtubeId}`);

    // Still look up TMDb ID so buildSpoilerWords can enrich with director filmography
    try {
      const result = await findTmdbMovie(movieTitle, movieYear, tmdbKey);
      if (result) {
        tmdbId = result.id;
        console.log(`    TMDb match: ${result.title} (${result.release_date?.slice(0,4)}) — ID: ${tmdbId}`);
      }
    } catch {
      // Non-fatal — enrichment will be skipped
    }
  } else {
    // Look up via TMDb
    tmdbId = cli.tmdbId;

    if (!tmdbId) {
      if (!cli.movie) { console.error('❌  Provide --movie "Title" --year YYYY  or  --tmdb-id ID'); process.exit(1); }
      console.log(`\n🔍  Searching TMDb for "${cli.movie}"${cli.year ? ` (${cli.year})` : ''}…`);
      const result = await findTmdbMovie(cli.movie, cli.year, tmdbKey);
      if (!result) { console.error(`❌  Movie not found on TMDb`); process.exit(1); }
      tmdbId     = result.id;
      movieTitle = result.title;
      movieYear  = parseInt(result.release_date?.slice(0, 4), 10);
      console.log(`✓   Found: ${movieTitle} (${movieYear}) — TMDb ID: ${tmdbId}`);
    } else {
      const details = await getTmdbMovieDetails(tmdbId, tmdbKey);
      movieTitle = details.title;
      movieYear  = parseInt(details.release_date?.slice(0, 4), 10);
      console.log(`\n✓   TMDb ID ${tmdbId}: ${movieTitle} (${movieYear})`);
    }

    if (!movieDirector && cli.director) movieDirector = cli.director;

    // Get official trailers, ranked
    console.log(`🎬  Fetching official trailers from TMDb…`);
    const trailers = await getOfficialTrailers(tmdbId, tmdbKey);
    if (!trailers.length) { console.error('❌  No YouTube trailers found on TMDb'); process.exit(1); }

    // Display candidates
    console.log(`\n    Found ${trailers.length} trailer(s):`);
    trailers.slice(0, 5).forEach((t, i) => {
      const star = i === 0 ? ' ← selected' : '';
      const off  = t.official ? '[official]' : '[unofficial]';
      console.log(`    ${i + 1}. ${off} ${t.quality}p  "${t.name}"  (${t.youtubeId})${star}`);
    });

    // Try each trailer in order until one works (age-restricted videos will fail)
    let picked = null;
    for (const t of trailers.slice(0, 5)) {
      try {
        getVideoInfo(`https://www.youtube.com/watch?v=${t.youtubeId}`);
        picked = t;
        break;
      } catch (e) {
        const reason = e.message.includes('age') ? 'age-restricted' : 'unavailable';
        console.log(`    ⚠️   Skipping "${t.name}" (${reason})`);
      }
    }
    if (!picked) { console.error('❌  All trailers failed (age-restricted or unavailable)'); process.exit(1); }
    youtubeId   = picked.youtubeId;
    trailerName = picked.name;
    console.log(`    ✓   Using: "${trailerName}"\n`);
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  // ── Step 2: Video info ──────────────────────────────────────────────────────

  console.log(`📋  Fetching video info…`);
  let videoInfo;
  try {
    videoInfo = getVideoInfo(youtubeUrl);
  } catch (e) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }
  channelName = videoInfo.channelName ?? channelName;
  const duration = videoInfo.duration;
  const isKnownStudio = OFFICIAL_KEYWORDS.some(k => channelName?.toLowerCase().includes(k));
  console.log(`    Channel:  ${channelName}${isKnownStudio ? '  ✓ known studio/distributor' : '  ⚠️  unrecognised channel'}`);
  console.log(`    Duration: ${fmt(duration)} (${duration}s)`);

  // ── Step 3: Download video ──────────────────────────────────────────────────

  const tmpDir     = os.tmpdir();
  const tmpBase    = path.join(tmpDir, `cinescenes_${Date.now()}`);
  const videoPath  = `${tmpBase}.mp4`;
  const audioPath  = `${tmpBase}.mp3`;
  const framesDir     = `${tmpBase}_frames`;
  const verifyFramesDir = `${tmpBase}_verify`;

  console.log(`\n📥  Downloading video (≤480p)…`);
  try {
    downloadVideo(youtubeUrl, videoPath);
  } catch (e) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }
  const videoSizeMB = (fs.statSync(videoPath).size / 1_000_000).toFixed(1);
  console.log(`    Saved to ${videoPath}  (${videoSizeMB} MB)`);

  let segments;
  let visualFlagged = [];
  let audioFlagged  = [];
  let finalWindow   = null;

  try {
    // ── Step 4: Extract audio ─────────────────────────────────────────────────

    console.log(`\n🎧  Extracting audio…`);
    extractAudio(videoPath, audioPath);
    const audioSizeMB = (fs.statSync(audioPath).size / 1_000_000).toFixed(1);
    console.log(`    Audio: ${audioPath}  (${audioSizeMB} MB)`);

    // ── Step 5: Transcribe ────────────────────────────────────────────────────

    console.log(`\n🤖  Transcribing with Groq Whisper…`);
    segments = await transcribeAudio(audioPath, groq);
    console.log(`    ${segments.length} segment(s) transcribed`);

    if (process.env.DEBUG) {
      console.log('\n--- Transcript ---');
      segments.forEach(s => console.log(`  [${fmt(s.start)} → ${fmt(s.end)}] ${s.text}`));
      console.log('------------------\n');
    }

    // ── Step 6: Extract full-video frames ────────────────────────────────────

    console.log(`\n🖼️   Extracting full-video frames at ${FRAMES_FPS}fps…`);
    const frames = extractFullVideoFrames(videoPath, framesDir);
    console.log(`    ${frames.length} frame(s) extracted`);

    // ── Step 7: Visual spoiler detection (Tesseract OCR) ─────────────────────

    console.log(`\n🔍  Building spoiler word list…`);
    const spoilerWords = await buildSpoilerWords(movieTitle, movieDirector, movieYear, tmdbId, tmdbKey);

    console.log(`\n👁️   Running vision analysis on frames (${VISION_MODEL})…`);
    visualFlagged = await detectVisualSpoilers(frames, spoilerWords, groq);
    if (visualFlagged.length === 0) {
      console.log(`    ✅  No visual spoilers detected`);
    } else {
      visualFlagged.forEach(f => {
        console.log(`    ⚠️   [${fmt(f.start)} – ${fmt(f.end)}]  "${f.text}"  → matched: ${f.matched.join(', ')}`);
      });
    }

    // ── Step 8: Audio spoiler analysis ────────────────────────────────────────

    audioFlagged = findFlaggedIntervals(segments, spoilerWords);

    console.log(`\n🔎  Audio spoiler analysis  (watching for: ${[...spoilerWords].join(', ')})`);
    if (audioFlagged.length === 0) {
      console.log(`    ✅  No spoilers detected in transcript`);
    } else {
      audioFlagged.forEach(f => {
        console.log(`    ⚠️   [${fmt(f.start)} – ${fmt(f.end)}]  "${f.text}"  → matched: ${f.matched.join(', ')}`);
      });
    }

    // ── Step 9: Find safe window + Vision LLM verification ────────────────────

    const allFlagged = [...audioFlagged, ...visualFlagged];
    let candidateWindow = findSafeWindow(duration, allFlagged);

    if (candidateWindow) {
      console.log(`\n🔬  Second-pass vision verification  (${fmt(candidateWindow.start)} – ${fmt(candidateWindow.end)})…`);
      console.log(`    Re-scanning at ${VERIFY_FPS}fps — 2× denser than full-video scan…`);
      const MAX_ITER = 3;
      let iter = 0;
      let windowClean = false;

      while (!windowClean && candidateWindow && iter < MAX_ITER) {
        const verifyFlagged = await verifyWindowWithVision(
          videoPath, candidateWindow.start, candidateWindow.end, verifyFramesDir, spoilerWords, groq,
        );

        if (verifyFlagged.length === 0) {
          windowClean = true;
          console.log(`    ✅  Window is clean`);
        } else {
          iter++;
          verifyFlagged.forEach(f =>
            console.log(`    ⚠️   [${fmt(f.start)} – ${fmt(f.end)}]  "${f.text}"  → matched: ${f.matched.join(', ')}`),
          );
          allFlagged.push(...verifyFlagged);
          candidateWindow = findSafeWindow(duration, allFlagged);
          if (!candidateWindow) {
            console.log(`    ❌  No clean window remains after vision verification`);
          } else {
            console.log(`    ↩️   Retrying with window ${fmt(candidateWindow.start)} – ${fmt(candidateWindow.end)}…`);
          }
        }
      }

      finalWindow = candidateWindow;
    }

  } finally {
    // ── Step 10: Cleanup ──────────────────────────────────────────────────────
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.rmSync(framesDir,      { recursive: true, force: true }); } catch {}
    try { fs.rmSync(verifyFramesDir, { recursive: true, force: true }); } catch {}
  }

  console.log('\n' + '─'.repeat(56));
  if (!finalWindow) {
    console.log(`❌  No clean ${MIN_CLIP_S}s+ window found in this trailer.`);
    console.log(`    Consider choosing a different trailer or reviewing manually.`);
    process.exit(0);
  }

  console.log(`\n✅  Safe window found`);
  console.log(`    Movie:  ${movieTitle} (${movieYear})`);
  console.log(`    Trailer: "${trailerName}" — https://youtu.be/${youtubeId}`);
  console.log(`    Channel: ${channelName}`);
  console.log(`    safe_start: ${finalWindow.start}s  (${fmt(finalWindow.start)})`);
  console.log(`    safe_end:   ${finalWindow.end}s  (${fmt(finalWindow.end)})`);
  console.log(`    Length:     ${finalWindow.end - finalWindow.start}s`);
  console.log('─'.repeat(56));

  // ── Update DB ───────────────────────────────────────────────────────────────

  if (cli.update) {
    console.log(`\n💾  Writing to Supabase…`);
    try {
      const row = await updateDatabase(movieTitle, movieYear, movieDirector, youtubeId, finalWindow.start, finalWindow.end, env);
      const verb = row.inserted ? 'Inserted' : 'Updated';
      console.log(`✓   ${verb} movies row: id=${row.id}  "${row.title}" (${row.year})`);
    } catch (e) {
      console.error(`❌  ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log(`\n    Run with --update to write these values to Supabase.`);
  }

  console.log();
}

main().catch(err => { console.error('\n❌  Unexpected error:', err.message); process.exit(1); });
