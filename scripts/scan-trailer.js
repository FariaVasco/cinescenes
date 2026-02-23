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
 *   brew install yt-dlp ffmpeg tesseract  # video/audio extraction + OCR
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
const FRAMES_FPS         = 0.5;  // 1 frame every 2s — title cards stay on screen ≥ 2s
const CREDIT_ZONE_HEAD_S = 15;   // seconds from start to scan (studio logos, opening cards)
const CREDIT_ZONE_TAIL_S = 45;   // seconds from end to scan (director/title credits)
const MAX_CLIP_S         = 60;   // max safe window length (seconds)
const MIN_CLIP_S         = 30;   // minimum useful window
const BUFFER_S           = 2;    // seconds of padding around flagged segments
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
 * Extract frames only from the "credit zones" — first CREDIT_ZONE_HEAD_S seconds
 * (studio logos) and last CREDIT_ZONE_TAIL_S seconds (director/title credits).
 * This covers ~95% of where text spoilers appear while scanning only a fraction
 * of the video. Returns [{framePath, timestamp}] sorted by timestamp.
 */
function extractCreditZoneFrames(videoPath, framesDir, duration) {
  fs.mkdirSync(framesDir, { recursive: true });

  const tailStart = Math.max(0, duration - CREDIT_ZONE_TAIL_S);
  const zones = [
    { name: 'head', start: 0,         len: Math.min(CREDIT_ZONE_HEAD_S, duration) },
    { name: 'tail', start: tailStart,  len: duration - tailStart },
  ];

  const frames = [];
  const seenTs = new Set();

  for (const zone of zones) {
    if (zone.len <= 0) continue;
    const zoneDir = path.join(framesDir, zone.name);
    fs.mkdirSync(zoneDir, { recursive: true });

    spawnSync('ffmpeg', [
      '-ss', String(zone.start),
      '-t',  String(zone.len),
      '-i',  videoPath,
      '-vf', `fps=${FRAMES_FPS}`,
      `${zoneDir}/frame_%05d.jpg`,
      '-y',
    ], { encoding: 'utf-8' });

    const files = fs.readdirSync(zoneDir).filter(f => f.endsWith('.jpg')).sort();
    for (let i = 0; i < files.length; i++) {
      const timestamp = zone.start + i / FRAMES_FPS;
      const tsKey = Math.round(timestamp * 10); // deduplicate at 0.1s granularity
      if (!seenTs.has(tsKey)) {
        seenTs.add(tsKey);
        frames.push({ framePath: path.join(zoneDir, files[i]), timestamp });
      }
    }
  }

  return frames.sort((a, b) => a.timestamp - b.timestamp);
}

// ── Tesseract OCR ─────────────────────────────────────────────────────────────

function checkTesseract() {
  const result = spawnSync('which', ['tesseract']);
  if (result.status !== 0) {
    console.error('\n❌  tesseract not found. Install it with:\n    brew install tesseract\n');
    process.exit(1);
  }
}

/**
 * Run Tesseract OCR on each frame (local, free).
 * --psm 11 = sparse text mode, best for title cards scattered across the frame.
 * Returns flagged intervals in the same shape as audio flagged intervals.
 */
function detectVisualSpoilers(frames, spoilerWords) {
  const flagged = [];

  for (const { framePath, timestamp } of frames) {
    const result = spawnSync('tesseract', [framePath, 'stdout', '--psm', '11'], {
      encoding: 'utf-8',
    });
    const text = (result.stdout ?? '').trim();
    if (!text) continue;

    const textLower = text.toLowerCase();
    const matched = [...spoilerWords].filter(w => textLower.includes(w));
    if (matched.length > 0) {
      flagged.push({
        start:   timestamp,
        end:     timestamp + 1 / FRAMES_FPS,
        text:    text.replace(/\n/g, ' ').slice(0, 120),
        matched,
      });
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
 */
function buildSpoilerWords(title, director, year) {
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for',
    'and', 'or', 'but', 'is', 'it', 'its', 'be', 'by', 'as', 'at', 'this',
    'that', 'with', 'from', 'into', 'was', 'are', 'not']);

  const words = new Set();

  const addPhrase = (phrase) => {
    if (!phrase) return;
    const tokens = phrase.toLowerCase().split(/[\s\-_,.:]+/).filter(w => w.length > 2 && !STOP.has(w));
    tokens.forEach(w => words.add(w));
  };

  addPhrase(title);
  addPhrase(director);
  if (year) {
    words.add(String(year));
    // Common spoken forms: "nineteen seventy-two", "two thousand and three"
    words.add(String(year).slice(2)); // e.g. "72" from 1972
  }

  return words;
}

function findFlaggedIntervals(segments, spoilerWords) {
  const flagged = [];

  for (const seg of segments) {
    const text = seg.text.toLowerCase();
    const matched = [...spoilerWords].filter(w => text.includes(w));
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

function findSafeWindow(totalDuration, flaggedIntervals) {
  // Expand each flagged segment by BUFFER_S on both sides
  const buffered = flaggedIntervals.map(f => [
    Math.max(0, f.start - BUFFER_S),
    Math.min(totalDuration, f.end + BUFFER_S),
  ]);
  const blocked = mergeIntervals(buffered);

  // Build list of clean regions
  const clean = [];
  let pos = 0;
  for (const [s, e] of blocked) {
    if (s > pos) clean.push([pos, s]);
    pos = e;
  }
  if (pos < totalDuration) clean.push([pos, totalDuration]);

  // Score each clean region: prefer early start, then longer window
  const candidates = clean
    .map(([s, e]) => {
      const available = e - s;
      const len = Math.min(available, MAX_CLIP_S);
      return { start: Math.round(s), end: Math.round(s + len), len };
    })
    .filter(c => c.len >= MIN_CLIP_S)
    .sort((a, b) => a.start - b.start || b.len - a.len);

  return candidates[0] ?? null;
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
  checkTesseract();

  const groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });

  // ── Step 1: Resolve movie metadata ─────────────────────────────────────────

  let movieTitle, movieYear, movieDirector, youtubeId, trailerName, channelName;

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
  } else {
    // Look up via TMDb
    let tmdbId = cli.tmdbId;

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

  const tmpDir    = os.tmpdir();
  const tmpBase   = path.join(tmpDir, `cinescenes_${Date.now()}`);
  const videoPath = `${tmpBase}.mp4`;
  const audioPath = `${tmpBase}.mp3`;
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

    // ── Step 6: Extract credit-zone frames ───────────────────────────────────

    console.log(`\n🖼️   Extracting credit-zone frames (first ${CREDIT_ZONE_HEAD_S}s + last ${CREDIT_ZONE_TAIL_S}s at ${FRAMES_FPS}fps)…`);
    const frames = extractCreditZoneFrames(videoPath, framesDir, duration);
    console.log(`    ${frames.length} frame(s) extracted`);

    // ── Step 7: Visual spoiler detection (Tesseract OCR) ─────────────────────

    const spoilerWords = buildSpoilerWords(movieTitle, movieDirector, movieYear);

    console.log(`\n👁️   Running Tesseract OCR on frames…`);
    visualFlagged = detectVisualSpoilers(frames, spoilerWords);
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

  } finally {
    // ── Step 9: Cleanup ───────────────────────────────────────────────────────
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
  }

  // ── Find safe window ────────────────────────────────────────────────────────

  const allFlagged = [...audioFlagged, ...visualFlagged];
  const window = findSafeWindow(duration, allFlagged);

  console.log('\n' + '─'.repeat(56));
  if (!window) {
    console.log(`❌  No clean ${MIN_CLIP_S}s+ window found in this trailer.`);
    console.log(`    Consider choosing a different trailer or reviewing manually.`);
    process.exit(0);
  }

  console.log(`\n✅  Safe window found`);
  console.log(`    Movie:  ${movieTitle} (${movieYear})`);
  console.log(`    Trailer: "${trailerName}" — https://youtu.be/${youtubeId}`);
  console.log(`    Channel: ${channelName}`);
  console.log(`    safe_start: ${window.start}s  (${fmt(window.start)})`);
  console.log(`    safe_end:   ${window.end}s  (${fmt(window.end)})`);
  console.log(`    Length:     ${window.end - window.start}s`);
  console.log('─'.repeat(56));

  // ── Update DB ───────────────────────────────────────────────────────────────

  if (cli.update) {
    console.log(`\n💾  Writing to Supabase…`);
    try {
      const row = await updateDatabase(movieTitle, movieYear, movieDirector, youtubeId, window.start, window.end, env);
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
