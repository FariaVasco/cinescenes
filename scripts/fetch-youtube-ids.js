#!/usr/bin/env node
/**
 * fetch-youtube-ids.js
 *
 * For movies in the DB that are missing a youtube_id, look up the official
 * trailer on TMDb and save the YouTube ID — without downloading or scanning.
 *
 * Usage:
 *   node scripts/fetch-youtube-ids.js --year 2010
 *   node scripts/fetch-youtube-ids.js --year-from 2000 --year-to 2010
 *   node scripts/fetch-youtube-ids.js --dry-run   (preview, no DB writes)
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ── Load .env ─────────────────────────────────────────────────────────────────
const ENV_FILE = path.resolve(__dirname, '../.env');
if (!fs.existsSync(ENV_FILE)) { console.error('No .env at project root'); process.exit(1); }
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; })
);

// ── CLI ───────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const get     = (k) => { const i = args.indexOf(k); return i !== -1 ? args[i+1] : null; };
const dryRun  = args.includes('--dry-run');
const yearArg = get('--year');
const yearFrom = parseInt(get('--year-from') ?? yearArg ?? '2000', 10);
const yearTo   = parseInt(get('--year-to')   ?? yearArg ?? '2010', 10);

// ── TMDb ──────────────────────────────────────────────────────────────────────
const TMDB_BASE = 'https://api.themoviedb.org/3';
const tmdbKey   = env['TMDB_API_KEY'];
if (!tmdbKey || tmdbKey.startsWith('your_')) { console.error('❌  TMDB_API_KEY not set in .env'); process.exit(1); }

async function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${tmdbKey}`);
  if (!res.ok) throw new Error(`TMDb ${res.status}: ${path}`);
  return res.json();
}

async function findTmdbId(title, year) {
  const q = encodeURIComponent(title);
  const data = await tmdb(`/search/movie?query=${q}&year=${year}&language=en-US`);
  if (!data.results?.length) return null;
  const sorted = data.results.sort((a, b) => {
    const aMatch = a.release_date?.slice(0,4) == year ? 0 : 1;
    const bMatch = b.release_date?.slice(0,4) == year ? 0 : 1;
    return aMatch - bMatch || b.popularity - a.popularity;
  });
  return sorted[0]?.id ?? null;
}

async function getBestTrailerId(tmdbId) {
  const data = await tmdb(`/movie/${tmdbId}/videos?language=en-US`);
  const trailers = (data.results ?? [])
    .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
    .sort((a, b) => {
      if (a.official !== b.official) return a.official ? -1 : 1;
      return new Date(a.published_at) - new Date(b.published_at);
    });
  return trailers[0]?.key ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(
    env['EXPO_PUBLIC_SUPABASE_URL'],
    env['SUPABASE_SERVICE_KEY'],
  );

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, title, year, director')
    .gte('year', yearFrom)
    .lte('year', yearTo)
    .is('youtube_id', null)
    .order('year')
    .order('title');

  if (error) { console.error('❌  Supabase error:', error.message); process.exit(1); }
  if (!movies?.length) { console.log('✅  No movies missing youtube_id in that range.'); return; }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🎬  Fetching YouTube IDs — ${movies.length} movie(s)  [${yearFrom}–${yearTo}]`);
  if (dryRun) console.log('    DRY RUN — no DB writes');
  console.log(`${'─'.repeat(60)}\n`);

  let ok = 0, missing = 0, failed = 0;

  for (let i = 0; i < movies.length; i++) {
    const m = movies[i];
    const label = `[${i+1}/${movies.length}]  "${m.title}" (${m.year})`;
    process.stdout.write(`${label}  …`);

    try {
      const tmdbId = await findTmdbId(m.title, m.year);
      if (!tmdbId) {
        process.stdout.write(`  ⚠️  not found on TMDb\n`);
        missing++;
        continue;
      }

      const youtubeId = await getBestTrailerId(tmdbId);
      if (!youtubeId) {
        process.stdout.write(`  ⚠️  no YouTube trailer on TMDb\n`);
        missing++;
        continue;
      }

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from('movies')
          .update({ youtube_id: youtubeId })
          .eq('id', m.id);
        if (upErr) throw upErr;
      }

      process.stdout.write(`  ✅  ${youtubeId}\n`);
      ok++;
    } catch (e) {
      process.stdout.write(`  ❌  ${e.message}\n`);
      failed++;
    }

    // Be polite to TMDb API
    if (i < movies.length - 1) await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊  Done`);
  console.log(`    ✅  Updated:  ${ok}`);
  if (missing) console.log(`    ⚠️   No trailer: ${missing}`);
  if (failed)  console.log(`    ❌  Errors:    ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);
}

main().catch(err => { console.error('\n❌  Unexpected error:', err.message); process.exit(1); });
