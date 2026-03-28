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
const FRAMES_FPS         = 0.66;  // 1 frame every ~1.5s — balance between coverage and API cost
const MAX_CLIP_S         = 60;    // max safe window length (seconds)
const MIN_CLIP_S         = 30;    // minimum useful window
const BUFFER_S           = 2;     // seconds of padding around flagged segments
const TAIL_BLOCK_S       = 15;    // always block the final N seconds — title card reliably appears here
const VISION_MODEL       = 'meta-llama/llama-4-scout-17b-16e-instruct';
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
 * Extract frames from a specific window [windowStart, windowEnd] of the video.
 * Clears framesDir before extracting. Returns [{framePath, timestamp}].
 */
function extractWindowFrames(videoPath, windowStart, windowEnd, framesDir) {
  try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(framesDir, { recursive: true });

  spawnSync('ffmpeg', [
    '-ss', String(windowStart),
    '-to', String(windowEnd),
    '-i',  videoPath,
    '-vf', `fps=${FRAMES_FPS},scale=320:-2`,
    `${framesDir}/frame_%05d.jpg`,
    '-y',
  ], { encoding: 'utf-8' });

  const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
  return files.map((f, i) => ({
    framePath: path.join(framesDir, f),
    timestamp: windowStart + i / FRAMES_FPS,
  }));
}

// ── Groq Vision ───────────────────────────────────────────────────────────────

/**
 * Analyse each frame with a vision LLM (Groq llama-3.2-vision).
 * Asks the model to transcribe all visible text, then matches against the
 * spoiler word list with the same regex logic used for audio.
 * Returns flagged intervals in the same shape as audio flagged intervals.
 */
// Minimum spacing between vision calls — persisted to a file so it carries
// across process boundaries (movie-to-movie in a batch run).
const VISION_SPACING_MS  = 2200;
const VISION_STATE_FILE  = path.join(os.tmpdir(), 'cinescenes_vision_state.json');

function readLastCallAt() {
  try { return JSON.parse(fs.readFileSync(VISION_STATE_FILE, 'utf-8')).lastCallAt ?? 0; } catch { return 0; }
}
function writeLastCallAt(ts) {
  fs.writeFileSync(VISION_STATE_FILE, JSON.stringify({ lastCallAt: ts }));
}

const VISION_PARAMS = (imageB64, wordList) => ({
  model: VISION_MODEL,
  messages: [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
      { type: 'text', text: `Look only at text displayed on screen (title cards, overlays, credits, subtitles). Do NOT describe the image or its content. Are any of these exact words visible as on-screen text: ${wordList}? List only the matching words you can see, one per line. If none of these words appear as on-screen text, reply exactly: NONE` },
    ],
  }],
  max_tokens:  80,
  temperature: 0,
});

// Read a header from a Headers object (fetch API) or plain object
function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

// Parse Groq's reset header — can be "Xs", "Xms", or a plain number (seconds)
function parseResetSec(value) {
  if (!value) return null;
  if (value.endsWith('ms')) return Math.ceil(parseInt(value) / 1000);
  if (value.endsWith('s'))  return parseInt(value);
  return parseInt(value);  // plain number = seconds
}

async function visionRequest(groq, imageB64, wordList) {
  // Enforce minimum spacing, honouring the last call time across process boundaries
  const lastCallAt = readLastCallAt();
  const spacingWait = lastCallAt + VISION_SPACING_MS - Date.now();
  if (spacingWait > 0) await new Promise(r => setTimeout(r, spacingWait));
  writeLastCallAt(Date.now());

  let rawResponse;
  try {
    const { data, response } = await groq.chat.completions.create(VISION_PARAMS(imageB64, wordList)).withResponse();
    rawResponse = response;
    // Log rate limit state on first call so we can see actual limits
    const limReq = getHeader(response.headers, 'x-ratelimit-limit-requests');
    const remReq = getHeader(response.headers, 'x-ratelimit-remaining-requests');
    const rstReq = getHeader(response.headers, 'x-ratelimit-reset-requests');
    const limTok = getHeader(response.headers, 'x-ratelimit-limit-tokens');
    const remTok = getHeader(response.headers, 'x-ratelimit-remaining-tokens');
    const rstTok = getHeader(response.headers, 'x-ratelimit-reset-tokens');
    if (limReq || limTok) {
      process.stdout.write(`    [rl] req ${remReq}/${limReq} (reset ${rstReq})  tok ${remTok}/${limTok} (reset ${rstTok})\n`);
    }
    return data;
  } catch (e) {
    const is429 = e.status === 429 || e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit');
    if (!is429) throw e;

    // Headers can be on the error object directly (OpenAI SDK APIError) or on e.response
    const errHeaders = e.headers ?? e.response?.headers ?? rawResponse?.headers ?? null;
    const retryAfter  = getHeader(errHeaders, 'retry-after');
    const rstRequests = getHeader(errHeaders, 'x-ratelimit-reset-requests');
    const rstTokens   = getHeader(errHeaders, 'x-ratelimit-reset-tokens');

    // Wait for whichever limit is exhausted (tokens often resets faster than requests)
    const waitReq = parseResetSec(rstRequests);
    const waitTok = parseResetSec(rstTokens);
    const waitSec = retryAfter ? parseInt(retryAfter, 10)
                  : (waitReq != null && waitTok != null) ? Math.max(waitReq, waitTok)
                  : waitReq ?? waitTok ?? 65;

    const limReq = getHeader(errHeaders, 'x-ratelimit-limit-requests');
    const limTok = getHeader(errHeaders, 'x-ratelimit-limit-tokens');
    console.warn(`\n    ⚠️  429 — limits: req=${limReq} tok=${limTok}  retry-after=${retryAfter}  reset-req=${rstRequests}  reset-tok=${rstTokens}`);
    console.warn(`    ⏳  Waiting ${waitSec}s…`);
    await new Promise(r => setTimeout(r, waitSec * 1000 + 500));
    writeLastCallAt(Date.now());

    // One retry after waiting
    const { data } = await groq.chat.completions.create(VISION_PARAMS(imageB64, wordList)).withResponse();
    return data;
  }
}

async function detectVisualSpoilers(frames, spoilerWords, groq) {
  const regexes = buildSpoilerRegexes(spoilerWords);
  const wordList = [...spoilerWords].join(', ');
  const flagged = [];

  for (const { framePath, timestamp } of frames) {
    const imageB64 = fs.readFileSync(framePath).toString('base64');

    try {
      const response = await visionRequest(groq, imageB64, wordList);
      const text = (response.choices[0]?.message?.content ?? '').trim();
      if (!text || /^none$/i.test(text)) continue;

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
 * Compute clean intervals from audio flags.
 * Applies BUFFER_S padding around each flag, blocks the final TAIL_BLOCK_S,
 * and returns the gaps as [{start, end, len}].
 */
function computeAudioSafeIntervals(audioFlagged, duration) {
  const buffered = audioFlagged.map(f => [
    Math.max(0, f.start - BUFFER_S),
    Math.min(duration, f.end + BUFFER_S),
  ]);
  buffered.push([Math.max(0, duration - TAIL_BLOCK_S), duration]);
  const blocked = mergeIntervals(buffered);

  const intervals = [];
  let pos = 0;
  for (const [bs, be] of blocked) {
    if (bs > pos) intervals.push({ start: pos, end: bs, len: bs - pos });
    if (be > pos) pos = be;
  }
  if (pos < duration) intervals.push({ start: pos, end: duration, len: duration - pos });
  return intervals;
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
    .update({ youtube_id: youtubeId, safe_start: safeStart, safe_end: safeEnd, scan_status: 'validated' })
    .ilike('title', movieTitle)
    .eq('year', movieYear)
    .select('id, title, year');

  if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);

  if (updated?.length) return { ...updated[0], inserted: false };

  // Row doesn't exist yet — insert it
  const { data: inserted, error: insertError } = await supabase
    .from('movies')
    .insert({ title: movieTitle, year: movieYear, director: movieDirector ?? null,
              youtube_id: youtubeId, safe_start: safeStart, safe_end: safeEnd, scan_status: 'validated' })
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
  const framesDir = `${tmpBase}_frames`;

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

    // ── Step 6: Build spoiler word lists ─────────────────────────────────────

    console.log(`\n🔍  Building spoiler word lists…`);
    const visualSpoilerWords = await buildSpoilerWords(movieTitle, movieDirector, movieYear, tmdbId, tmdbKey);
    const audioSpoilerWords  = await buildSpoilerWords(movieTitle, movieDirector, movieYear, null, null);

    // ── Step 7: Audio analysis → compute safe intervals ──────────────────────

    audioFlagged = findFlaggedIntervals(segments, audioSpoilerWords);

    console.log(`\n🔎  Audio spoiler analysis  (watching for: ${[...audioSpoilerWords].join(', ')})`);
    if (audioFlagged.length === 0) {
      console.log(`    ✅  No spoilers detected in transcript`);
    } else {
      audioFlagged.forEach(f => {
        console.log(`    ⚠️   [${fmt(f.start)} – ${fmt(f.end)}]  "${f.text}"  → matched: ${f.matched.join(', ')}`);
      });
    }

    const audioIntervals = computeAudioSafeIntervals(audioFlagged, duration)
      .filter(iv => iv.len >= MIN_CLIP_S);

    if (audioIntervals.length === 0) {
      console.log(`    ❌  No audio-safe interval ≥ ${MIN_CLIP_S}s — cannot find a safe window`);
    } else {
      // Sort: middle intervals first (don't start at 0, don't end at effective trailer end)
      // then longest first within each group
      const effectiveEnd = duration - TAIL_BLOCK_S;
      const isMid = iv => iv.start > 0 && iv.end < effectiveEnd;
      audioIntervals.sort((a, b) => {
        const am = isMid(a), bm = isMid(b);
        if (am !== bm) return am ? -1 : 1;
        return b.len - a.len;
      });

      console.log(`\n    Audio-safe intervals (${audioIntervals.length}):`);
      audioIntervals.forEach((iv, i) => {
        console.log(`    ${i + 1}. [${fmt(iv.start)} – ${fmt(iv.end)}]  ${Math.round(iv.len)}s${isMid(iv) ? '  [middle]' : ''}`);
      });

      // ── Step 8: Vision analysis — audio-first approach ────────────────────

      console.log(`\n👁️   Vision analysis per interval (${VISION_MODEL})…`);

      const candidates = [];  // clean intervals 30–60s (fallback pool)
      const queue = [...audioIntervals];

      while (queue.length > 0 && !finalWindow) {
        const iv = queue.shift();
        const scanEnd = Math.min(iv.start + MAX_CLIP_S, iv.end);
        console.log(`\n    Scanning [${fmt(iv.start)} – ${fmt(scanEnd)}]  (${Math.round(scanEnd - iv.start)}s)…`);

        const frames  = extractWindowFrames(videoPath, iv.start, scanEnd, framesDir);
        const spoilers = await detectVisualSpoilers(frames, visualSpoilerWords, groq);

        if (spoilers.length === 0) {
          if (iv.len >= MAX_CLIP_S) {
            finalWindow = { start: Math.round(iv.start), end: Math.round(iv.start + MAX_CLIP_S), len: MAX_CLIP_S };
            console.log(`    ✅  Clean ${MAX_CLIP_S}s window — done`);
          } else {
            candidates.push(iv);
            console.log(`    ✅  Clean ${Math.round(iv.len)}s (kept as fallback)`);
          }
        } else {
          spoilers.forEach(s => {
            console.log(`    ⚠️   [${fmt(s.start)} – ${fmt(s.end)}]  "${s.text}"  → matched: ${s.matched.join(', ')}`);
          });

          // Split interval around each spoiler block (with BUFFER_S padding)
          const spoilerBlocked = mergeIntervals(spoilers.map(s => [
            Math.max(iv.start, s.start - BUFFER_S),
            Math.min(iv.end,   s.end   + BUFFER_S),
          ]));

          let pos = iv.start;
          for (const [bs, be] of spoilerBlocked) {
            const sub = { start: pos, end: Math.min(bs, iv.end), len: Math.min(bs, iv.end) - pos };
            if (sub.len >= MIN_CLIP_S) {
              if (sub.end <= scanEnd) {
                candidates.push(sub);
                console.log(`    📋  [${fmt(sub.start)} – ${fmt(sub.end)}]  ${Math.round(sub.len)}s — fallback candidate`);
              } else {
                queue.unshift(sub);
                console.log(`    🔁  [${fmt(sub.start)} – ${fmt(sub.end)}]  ${Math.round(sub.len)}s — queued`);
              }
            } else {
              console.log(`    ✂️   [${fmt(sub.start)} – ${fmt(sub.end)}]  ${Math.round(sub.len)}s — too short, discarded`);
            }
            pos = be;
          }
          // Remainder after last spoiler block
          if (pos < iv.end) {
            const sub = { start: pos, end: iv.end, len: iv.end - pos };
            if (sub.len >= MIN_CLIP_S) {
              queue.unshift(sub);
              console.log(`    🔁  [${fmt(sub.start)} – ${fmt(sub.end)}]  ${Math.round(sub.len)}s — queued`);
            } else {
              console.log(`    ✂️   [${fmt(sub.start)} – ${fmt(sub.end)}]  ${Math.round(sub.len)}s — too short, discarded`);
            }
          }
        }
      }

      // Fallback: pick longest clean candidate
      if (!finalWindow && candidates.length > 0) {
        candidates.sort((a, b) => b.len - a.len);
        const best = candidates[0];
        finalWindow = {
          start: Math.round(best.start),
          end:   Math.round(Math.min(best.start + MAX_CLIP_S, best.end)),
          len:   Math.round(Math.min(best.len, MAX_CLIP_S)),
        };
        console.log(`\n    📋  No ${MAX_CLIP_S}s clean window found — using longest fallback [${fmt(finalWindow.start)} – ${fmt(finalWindow.end)}]  ${finalWindow.len}s`);
      }
    }

  } finally {
    // ── Step 9: Cleanup ───────────────────────────────────────────────────────
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
  }

  console.log('\n' + '─'.repeat(56));
  if (!finalWindow) {
    console.log(`❌  No clean ${MIN_CLIP_S}s+ window found in this trailer.`);
    console.log(`    Consider choosing a different trailer or reviewing manually.`);
    process.exit(2);  // non-zero so batch scanner marks safe_start = -1
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
