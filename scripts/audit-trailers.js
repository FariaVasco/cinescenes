#!/usr/bin/env node
/**
 * Cinescenes — Trailer Audit
 *
 * For every movie in the database:
 *  1. Fetch available trailers from TMDb (official first, oldest first)
 *  2. Check if the stored youtube_id appears in TMDb's official trailer list
 *  3. For IDs not in TMDb's list → verify the YouTube channel via yt-dlp
 *  4. Find the best replacement trailer if the current one is unofficial
 *  5. Report everything — no DB writes
 *
 * Output:
 *   scripts/output/trailer-audit.json   raw data
 *   scripts/output/trailer-audit.md     human-readable report
 *
 * Usage:
 *   node scripts/audit-trailers.js
 *   node scripts/audit-trailers.js --limit 20   # audit only first N movies
 */

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Constants ─────────────────────────────────────────────────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const OUTPUT_DIR = path.join(__dirname, 'output');

// Must match scan-trailer.js
const OFFICIAL_KEYWORDS = [
  'warner', 'universal', 'paramount', 'sony', 'disney', 'marvel',
  'a24', 'lionsgate', 'miramax', 'mgm', 'dreamworks', 'fox',
  'netflix', 'apple', 'amazon', 'neon', 'searchlight', 'focus features',
  'annapurna', 'new line', 'columbia',
];

const YTDLP_COOKIE_ARGS = ['--cookies-from-browser', 'safari'];

// Concurrency
const TMDB_BATCH    = 8;   // parallel TMDb searches
const YTDLP_BATCH   = 3;   // parallel yt-dlp info checks (be gentle on YouTube)
const TMDB_DELAY_MS = 150; // ms between TMDb batches

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadEnv() {
  const envFile = path.join(__dirname, '../.env');
  if (!fs.existsSync(envFile)) { console.error('No .env at project root'); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function parseCli() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  return { limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null };
}

async function tmdb(urlPath, apiKey) {
  const sep = urlPath.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${urlPath}${sep}api_key=${apiKey}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Search TMDb for a movie by title+year, return TMDb movie ID or null.
 */
async function findTmdbId(title, year, apiKey) {
  try {
    const q = encodeURIComponent(title);
    const yearParam = year ? `&year=${year}` : '';
    const data = await tmdb(`/search/movie?query=${q}${yearParam}&language=en-US`, apiKey);
    if (!data?.results?.length) return null;
    const sorted = data.results.sort((a, b) => {
      const ay = a.release_date?.slice(0, 4);
      const by = b.release_date?.slice(0, 4);
      const aMatch = year ? (ay == year ? 0 : 1) : 0;
      const bMatch = year ? (by == year ? 0 : 1) : 0;
      return aMatch - bMatch || b.popularity - a.popularity;
    });
    return sorted[0].id;
  } catch {
    return null;
  }
}

/**
 * Get all YouTube trailers for a TMDb movie ID.
 * Returns them sorted: official first, then oldest publish date.
 */
async function getTmdbTrailers(tmdbId, apiKey) {
  try {
    const data = await tmdb(`/movie/${tmdbId}/videos?language=en-US`, apiKey);
    const videos = data?.results ?? [];
    return videos
      .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
      .map(v => ({
        name:        v.name,
        youtubeId:   v.key,
        quality:     v.size,
        official:    v.official,
        publishedAt: v.published_at,
      }))
      .sort((a, b) => {
        if (a.official !== b.official) return a.official ? -1 : 1;
        return new Date(a.publishedAt) - new Date(b.publishedAt);
      });
  } catch {
    return [];
  }
}

/**
 * Get YouTube channel name via yt-dlp --dump-json (metadata only, no download).
 * Returns { channelName, duration, title } or null on failure.
 */
function getYtChannel(youtubeId) {
  try {
    const result = spawnSync('yt-dlp', [
      '--dump-json', '--no-playlist',
      ...YTDLP_COOKIE_ARGS,
      `https://www.youtube.com/watch?v=${youtubeId}`,
    ], { encoding: 'utf-8', timeout: 20_000 });
    if (result.status !== 0) return null;
    const info = JSON.parse(result.stdout);
    return {
      channelName: info.channel ?? info.uploader ?? null,
      duration:    info.duration ?? null,
      title:       info.title ?? null,
    };
  } catch {
    return null;
  }
}

function isOfficialChannel(channelName) {
  if (!channelName) return false;
  const lower = channelName.toLowerCase();
  return OFFICIAL_KEYWORDS.some(k => lower.includes(k));
}

/**
 * Pick the best trailer from a list:
 * - Prefer official over unofficial
 * - Among officials, prefer oldest (original theatrical trailer)
 * - Prefer ≥720p quality
 * Already sorted by (official desc, date asc) from getTmdbTrailers.
 */
function pickBestTrailer(trailers) {
  if (!trailers.length) return null;
  // First try: official ≥720p
  const hd = trailers.find(t => t.official && t.quality >= 720);
  if (hd) return hd;
  // Second try: any official
  const official = trailers.find(t => t.official);
  if (official) return official;
  // Third try: any trailer ≥720p
  const anyHd = trailers.find(t => t.quality >= 720);
  if (anyHd) return anyHd;
  // Fallback: first available
  return trailers[0];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runBatch(items, fn, batchSize, delayMs = 0) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (delayMs && i + batchSize < items.length) await sleep(delayMs);
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cli = parseCli();
  const env = loadEnv();

  const tmdbKey = env['TMDB_API_KEY'];
  if (!tmdbKey) { console.error('❌  TMDB_API_KEY not set'); process.exit(1); }

  const supabaseUrl = env['EXPO_PUBLIC_SUPABASE_URL'];
  const serviceKey  = env['SUPABASE_SERVICE_KEY'];
  if (!supabaseUrl || !serviceKey) { console.error('❌  Supabase credentials not set'); process.exit(1); }

  const db = createClient(supabaseUrl, serviceKey);

  // ── Fetch movies ────────────────────────────────────────────────────────────

  console.log('\n📚  Fetching movies from Supabase…');
  let { data: movies, error } = await db.from('movies').select('id,title,year,director,youtube_id,safe_start,safe_end,active').order('year');
  if (error) { console.error('❌  Supabase error:', error.message); process.exit(1); }

  if (cli.limit) movies = movies.slice(0, cli.limit);
  console.log(`    ${movies.length} movie(s) loaded${cli.limit ? ` (limited to ${cli.limit})` : ''}`);

  // ── Step 1: TMDb lookup for every movie ─────────────────────────────────────

  console.log('\n🔍  Searching TMDb for all movies…');
  let tmdbDone = 0;

  const tmdbData = await runBatch(movies, async (movie) => {
    const tmdbId = await findTmdbId(movie.title, movie.year, tmdbKey);
    const trailers = tmdbId ? await getTmdbTrailers(tmdbId, tmdbKey) : [];
    process.stdout.write(`\r    ${++tmdbDone}/${movies.length} searched…`);
    return { movieId: movie.id, tmdbId, trailers };
  }, TMDB_BATCH, TMDB_DELAY_MS);

  console.log('\n    ✓ Done');

  // Build lookup map
  const byMovieId = {};
  for (const d of tmdbData) byMovieId[d.movieId] = d;

  // ── Step 2: For movies with an existing youtube_id not in TMDb's list,
  //            verify the channel via yt-dlp ───────────────────────────────────

  const needChannelCheck = movies.filter(m => {
    if (!m.youtube_id) return false;
    const { trailers } = byMovieId[m.id] ?? {};
    // If TMDb has trailers and the current ID is among the OFFICIAL ones, skip check
    const inOfficialList = trailers?.some(t => t.youtubeId === m.youtube_id && t.official);
    return !inOfficialList;
  });

  if (needChannelCheck.length) {
    console.log(`\n📡  Checking ${needChannelCheck.length} YouTube channel(s) via yt-dlp…`);
    let ytDone = 0;
    const channelResults = await runBatch(needChannelCheck, async (movie) => {
      const info = getYtChannel(movie.youtube_id);
      process.stdout.write(`\r    ${++ytDone}/${needChannelCheck.length} checked…`);
      return { movieId: movie.id, youtubeId: movie.youtube_id, ytInfo: info };
    }, YTDLP_BATCH, 300);
    console.log('\n    ✓ Done');

    for (const { movieId, ytInfo } of channelResults) {
      byMovieId[movieId].ytInfo = ytInfo;
    }
  }

  // ── Step 3: Categorise every movie ─────────────────────────────────────────

  const results = {
    OFFICIAL:               [],  // current youtube_id is from a known studio channel or in TMDb official list
    UNOFFICIAL_UPGRADED:    [],  // current is unofficial but TMDb has a better official trailer
    UNOFFICIAL_NO_ALT:      [],  // current is unofficial and TMDb has nothing better
    NO_TRAILER:             [],  // no youtube_id stored at all
    BROKEN:                 [],  // youtube_id stored but video is unavailable / deleted
    NOT_ON_TMDB:            [],  // couldn't find movie on TMDb at all
  };

  for (const movie of movies) {
    const { tmdbId, trailers, ytInfo } = byMovieId[movie.id] ?? {};
    const best = pickBestTrailer(trailers ?? []);

    const entry = {
      id:         movie.id,
      title:      movie.title,
      year:       movie.year,
      director:   movie.director,
      active:     movie.active,
      current: {
        youtubeId:  movie.youtube_id ?? null,
        safeStart:  movie.safe_start ?? null,
        safeEnd:    movie.safe_end ?? null,
        channel:    ytInfo?.channelName ?? null,
        official:   ytInfo ? isOfficialChannel(ytInfo.channelName) : null,
        duration:   ytInfo?.duration ?? null,
        videoTitle: ytInfo?.title ?? null,
      },
      tmdb: {
        id:       tmdbId ?? null,
        trailers: (trailers ?? []).slice(0, 6),  // keep top 6 for the report
        best:     best ?? null,
      },
    };

    if (!movie.youtube_id) {
      results.NO_TRAILER.push(entry);
      continue;
    }

    if (!tmdbId) {
      // Can't look up on TMDb — classify based on yt-dlp channel only
      if (ytInfo === null) {
        results.BROKEN.push(entry);
      } else if (ytInfo && isOfficialChannel(ytInfo.channelName)) {
        results.OFFICIAL.push(entry);
      } else {
        results.NOT_ON_TMDB.push(entry);
      }
      continue;
    }

    // Is current ID in TMDb's official trailer list?
    const inOfficialList = trailers?.some(t => t.youtubeId === movie.youtube_id && t.official);
    // Is current ID in TMDb's any trailer list (official or not)?
    const inAnyTmdbList = trailers?.some(t => t.youtubeId === movie.youtube_id);
    // Is channel verified as official via yt-dlp?
    const channelOfficial = ytInfo ? isOfficialChannel(ytInfo.channelName) : false;

    if (inOfficialList || channelOfficial) {
      results.OFFICIAL.push(entry);
    } else if (ytInfo === null) {
      results.BROKEN.push(entry);
    } else if (best && best.youtubeId !== movie.youtube_id) {
      // Have a better official option
      results.UNOFFICIAL_UPGRADED.push(entry);
    } else {
      results.UNOFFICIAL_NO_ALT.push(entry);
    }
  }

  // ── Step 4: Write JSON output ───────────────────────────────────────────────

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'trailer-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n💾  Raw data → ${jsonPath}`);

  // ── Step 5: Write Markdown report ──────────────────────────────────────────

  const lines = [];

  const stamp = new Date().toISOString().slice(0, 10);
  lines.push(`# Cinescenes — Trailer Audit  (${stamp})`);
  lines.push('');
  lines.push('> Read-only audit. No database changes were made.');
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|------:|');
  lines.push(`| ✅ Official / already correct | ${results.OFFICIAL.length} |`);
  lines.push(`| ⬆️  Unofficial → better trailer found on TMDb | ${results.UNOFFICIAL_UPGRADED.length} |`);
  lines.push(`| ⚠️  Unofficial, no TMDb alternative | ${results.UNOFFICIAL_NO_ALT.length} |`);
  lines.push(`| 🚫 Broken / unavailable video | ${results.BROKEN.length} |`);
  lines.push(`| ❌ No trailer stored | ${results.NO_TRAILER.length} |`);
  lines.push(`| 🔎 Not found on TMDb | ${results.NOT_ON_TMDB.length} |`);
  lines.push(`| **TOTAL** | **${movies.length}** |`);
  lines.push('');

  // ── UPGRADED section ──────────────────────────────────────────────────────
  if (results.UNOFFICIAL_UPGRADED.length) {
    lines.push('---');
    lines.push('');
    lines.push(`## ⬆️  Unofficial → Better Trailer Available (${results.UNOFFICIAL_UPGRADED.length})`);
    lines.push('');
    lines.push('These movies have unofficial (fan-upload / aggregator) trailers stored. TMDb has a better official alternative.');
    lines.push('Run `node scripts/scan-trailer.js --tmdb-id <ID> --update` to switch and compute safe intervals.');
    lines.push('');

    for (const m of results.UNOFFICIAL_UPGRADED) {
      lines.push(`### ${m.title} (${m.year})`);
      if (m.director) lines.push(`*${m.director}*`);
      lines.push('');
      lines.push('**Current**');
      lines.push(`- YouTube: https://youtu.be/${m.current.youtubeId}`);
      lines.push(`- Channel: ${m.current.channel ?? 'unknown'} — ${m.current.official === false ? 'unofficial' : 'not verified as studio'}`);
      if (m.current.safeStart !== null) lines.push(`- Safe window: ${m.current.safeStart}s – ${m.current.safeEnd}s (already scanned)`);
      lines.push('');
      lines.push('**Best TMDb alternative**');
      const b = m.tmdb.best;
      lines.push(`- "${b.name}"  |  ${b.quality}p  |  ${b.official ? 'official' : 'unofficial'}  |  published ${b.publishedAt?.slice(0,10)}`);
      lines.push(`- YouTube: https://youtu.be/${b.youtubeId}`);
      if (m.tmdb.id) lines.push(`- TMDb ID: ${m.tmdb.id}  →  \`node scripts/scan-trailer.js --tmdb-id ${m.tmdb.id} --update\``);
      lines.push('');
      if (m.tmdb.trailers.length > 1) {
        lines.push('<details><summary>All TMDb options</summary>');
        lines.push('');
        lines.push('| # | Name | Quality | Official | Published | YouTube |');
        lines.push('|---|------|---------|----------|-----------|---------|');
        m.tmdb.trailers.forEach((t, i) => {
          const mark = t.youtubeId === b.youtubeId ? '★' : `${i+1}`;
          lines.push(`| ${mark} | ${t.name} | ${t.quality}p | ${t.official ? '✅' : '❌'} | ${t.publishedAt?.slice(0,10)} | [link](https://youtu.be/${t.youtubeId}) |`);
        });
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }
  }

  // ── NO ALTERNATIVE section ────────────────────────────────────────────────
  if (results.UNOFFICIAL_NO_ALT.length) {
    lines.push('---');
    lines.push('');
    lines.push(`## ⚠️  Unofficial — No TMDb Alternative (${results.UNOFFICIAL_NO_ALT.length})`);
    lines.push('');
    lines.push('These trailers appear to be from unofficial channels and TMDb has no better option. Manual review recommended.');
    lines.push('');
    lines.push('| Title | Year | Director | YouTube | Channel |');
    lines.push('|-------|------|----------|---------|---------|');
    for (const m of results.UNOFFICIAL_NO_ALT) {
      const ch = m.current.channel ? m.current.channel.replace(/\|/g, '/') : 'unknown';
      lines.push(`| ${m.title} | ${m.year} | ${m.director ?? '—'} | [link](https://youtu.be/${m.current.youtubeId}) | ${ch} |`);
    }
    lines.push('');
  }

  // ── BROKEN section ────────────────────────────────────────────────────────
  if (results.BROKEN.length) {
    lines.push('---');
    lines.push('');
    lines.push(`## 🚫  Broken / Unavailable Videos (${results.BROKEN.length})`);
    lines.push('');
    lines.push('The stored YouTube ID returned an error (deleted, private, or age-restricted). These need a new trailer.');
    lines.push('');
    lines.push('| Title | Year | Director | Stored YouTube ID | TMDb ID | Best TMDb Option |');
    lines.push('|-------|------|----------|-------------------|---------|-----------------|');
    for (const m of results.BROKEN) {
      const tmdbScan = m.tmdb.id ? `\`--tmdb-id ${m.tmdb.id}\`` : 'not found';
      const best = m.tmdb.best ? `[${m.tmdb.best.name}](https://youtu.be/${m.tmdb.best.youtubeId})` : '—';
      lines.push(`| ${m.title} | ${m.year} | ${m.director ?? '—'} | \`${m.current.youtubeId}\` | ${m.tmdb.id ?? '—'} | ${best} |`);
    }
    lines.push('');
  }

  // ── NO TRAILER section ────────────────────────────────────────────────────
  if (results.NO_TRAILER.length) {
    lines.push('---');
    lines.push('');
    lines.push(`## ❌  No Trailer Stored (${results.NO_TRAILER.length})`);
    lines.push('');
    lines.push('| Title | Year | Director | TMDb ID | Best Option |');
    lines.push('|-------|------|----------|---------|-------------|');
    for (const m of results.NO_TRAILER) {
      const tmdbScan = m.tmdb.id ? `\`--tmdb-id ${m.tmdb.id}\`` : 'not on TMDb';
      const best = m.tmdb.best ? `[${m.tmdb.best.name}](https://youtu.be/${m.tmdb.best.youtubeId}) ${m.tmdb.best.official ? '✅' : '❌'}` : '—';
      lines.push(`| ${m.title} | ${m.year} | ${m.director ?? '—'} | ${tmdbScan} | ${best} |`);
    }
    lines.push('');
  }

  // ── NOT ON TMDB section ───────────────────────────────────────────────────
  if (results.NOT_ON_TMDB.length) {
    lines.push('---');
    lines.push('');
    lines.push(`## 🔎  Not Found on TMDb (${results.NOT_ON_TMDB.length})`);
    lines.push('');
    lines.push('Could not match these to a TMDb record. Verify title/year spelling or search TMDb manually.');
    lines.push('');
    lines.push('| Title | Year | Director | Stored YouTube | Channel |');
    lines.push('|-------|------|----------|----------------|---------|');
    for (const m of results.NOT_ON_TMDB) {
      const ytLink = m.current.youtubeId ? `[link](https://youtu.be/${m.current.youtubeId})` : '—';
      const ch = m.current.channel ?? 'unknown';
      lines.push(`| ${m.title} | ${m.year} | ${m.director ?? '—'} | ${ytLink} | ${ch} |`);
    }
    lines.push('');
  }

  // ── OFFICIAL section (compact) ────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(`## ✅  Official / Already Correct (${results.OFFICIAL.length})`);
  lines.push('');
  lines.push('<details><summary>Expand full list</summary>');
  lines.push('');
  lines.push('| Title | Year | YouTube | Channel | Safe Window |');
  lines.push('|-------|------|---------|---------|-------------|');
  for (const m of results.OFFICIAL) {
    const ytLink = `[link](https://youtu.be/${m.current.youtubeId})`;
    const ch = m.current.channel ? m.current.channel.replace(/\|/g, '/') : '(in TMDb official list)';
    const sw = m.current.safeStart !== null ? `${m.current.safeStart}s–${m.current.safeEnd}s` : 'not scanned';
    lines.push(`| ${m.title} | ${m.year} | ${ytLink} | ${ch} | ${sw} |`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');

  // ── Recommended next steps ────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('## Next Steps');
  lines.push('');
  lines.push('### 1. Upgrade unofficial trailers');
  lines.push('For each movie in the "Unofficial → Better Available" section, run:');
  lines.push('```bash');
  lines.push('node scripts/scan-trailer.js --tmdb-id <ID> --update');
  lines.push('```');
  lines.push('This downloads the trailer, transcribes it with Whisper, runs visual analysis, and writes the safe window to Supabase.');
  lines.push('');
  lines.push('### 2. Fix broken trailers');
  lines.push('Use the TMDb IDs listed in the "Broken" section. Same command as above.');
  lines.push('');
  lines.push('### 3. Manually flag no-alternative unofficials');
  lines.push('For the "Unofficial — No Alternative" group, either:');
  lines.push('- Find a better YouTube URL and run: `node scripts/scan-trailer.js --youtube-id <YT_ID> --movie "Title" --year YYYY --update`');
  lines.push('- Or mark those movies as `flagged=true` in Supabase to exclude from the game deck.');

  const mdPath = path.join(OUTPUT_DIR, 'trailer-audit.md');
  fs.writeFileSync(mdPath, lines.join('\n'));
  console.log(`📄  Report → ${mdPath}`);

  // ── Console summary ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(56));
  console.log('  TRAILER AUDIT RESULTS');
  console.log('═'.repeat(56));
  console.log(`  ✅  Official / correct:           ${String(results.OFFICIAL.length).padStart(4)}`);
  console.log(`  ⬆️   Unofficial + better on TMDb:  ${String(results.UNOFFICIAL_UPGRADED.length).padStart(4)}`);
  console.log(`  ⚠️   Unofficial, no alternative:   ${String(results.UNOFFICIAL_NO_ALT.length).padStart(4)}`);
  console.log(`  🚫  Broken / unavailable:          ${String(results.BROKEN.length).padStart(4)}`);
  console.log(`  ❌  No trailer stored:             ${String(results.NO_TRAILER.length).padStart(4)}`);
  console.log(`  🔎  Not found on TMDb:             ${String(results.NOT_ON_TMDB.length).padStart(4)}`);
  console.log('─'.repeat(56));
  console.log(`  Total:                           ${String(movies.length).padStart(4)}`);
  console.log('═'.repeat(56));
  console.log(`\n  Full report: ${mdPath}\n`);
}

main().catch(err => { console.error('\n❌  Unexpected error:', err.message, err.stack); process.exit(1); });
