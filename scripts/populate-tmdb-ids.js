#!/usr/bin/env node
/**
 * Cinescenes — Populate TMDb IDs
 *
 * Finds movies in Supabase that have no tmdb_id set, searches TMDb
 * by title + year, and updates the row with the matched ID.
 *
 * Usage:
 *   node scripts/populate-tmdb-ids.js
 *   node scripts/populate-tmdb-ids.js --dry-run
 *   node scripts/populate-tmdb-ids.js --limit 50
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ENV_FILE = path.join(__dirname, '../.env');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

async function tmdbSearch(title, year, apiKey) {
  const q = encodeURIComponent(title);
  const url = `https://api.themoviedb.org/3/search/movie?query=${q}&year=${year}&api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : Infinity;

  const env = loadEnv();
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const tmdbKey = env.TMDB_API_KEY ?? env.EXPO_PUBLIC_TMDB_API_KEY;
  if (!supabaseUrl || !tmdbKey) { console.error('Missing SUPABASE_URL or TMDB_API_KEY'); process.exit(1); }

  const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_KEY);

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, title, year')
    .is('tmdb_id', null)
    .order('year', { ascending: true });

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  if (!movies?.length) { console.log('✅  All movies already have tmdb_id set.'); return; }

  const batch = movies.slice(0, limit);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🎬  Populating tmdb_id for ${batch.length} movie(s)${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`${'─'.repeat(60)}\n`);

  let ok = 0, notFound = 0, skipped = 0;

  for (const movie of batch) {
    const results = await tmdbSearch(movie.title, movie.year, tmdbKey);
    if (!results) { console.log(`  ⚠️   "${movie.title}" — TMDb request failed`); skipped++; continue; }

    // Best match: same year, title similarity
    const match = results.find(r => {
      const rYear = r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : null;
      return rYear === movie.year;
    }) ?? results[0]; // fall back to top result if no exact year match

    if (!match) {
      console.log(`  ❌  "${movie.title}" (${movie.year}) — not found on TMDb`);
      notFound++;
      continue;
    }

    const rYear = match.release_date ? parseInt(match.release_date.slice(0, 4), 10) : null;
    const yearOk = rYear === movie.year;
    console.log(`  ${yearOk ? '✅' : '⚠️ '} "${movie.title}" (${movie.year}) → TMDb ID ${match.id} "${match.title}" (${rYear})${dryRun ? ' [dry run]' : ''}`);

    if (!dryRun) {
      await supabase.from('movies').update({ tmdb_id: match.id }).eq('id', movie.id);
    }
    ok++;

    // Brief pause to stay within TMDb rate limits
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊  Done — ✅ ${ok} updated, ❌ ${notFound} not found, ⚠️  ${skipped} skipped`);
  console.log(`${'─'.repeat(60)}\n`);
}

main().catch(err => { console.error('Unexpected error:', err.message); process.exit(1); });
