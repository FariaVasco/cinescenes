#!/usr/bin/env node
/**
 * Cinescenes — Batch Trailer Scanner
 *
 * Fetches all movies from Supabase that still need a safe window
 * (safe_start IS NULL) and runs scan-trailer.js for each one in sequence.
 * Results are written to Supabase automatically (--update is always on).
 *
 * Usage:
 *   node scripts/scan-batch.js                  # scan all unscanned movies
 *   node scripts/scan-batch.js --limit 10       # do at most 10 this run
 *   node scripts/scan-batch.js --year 2024      # only movies from a specific year
 *   node scripts/scan-batch.js --dry-run        # list what would be processed, don't scan
 *   node scripts/scan-batch.js --retry-failed   # re-scan movies where safe_start = -1 (failed marker)
 *   node scripts/scan-batch.js --movie-id <id>  # scan a single movie by its Supabase UUID
 */

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const { createClient } = require('@supabase/supabase-js');

const ENV_FILE    = path.join(__dirname, '../.env');
const SCANNER     = path.join(__dirname, 'scan-trailer.js');
const LOG_FILE    = path.join(__dirname, 'output/scan-batch.log');

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
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
  return {
    limit:        get('--limit')    ? parseInt(get('--limit'), 10) : Infinity,
    year:         get('--year')     ? parseInt(get('--year'), 10) : null,
    dryRun:       args.includes('--dry-run'),
    retryFailed:  args.includes('--retry-failed'),
    movieId:      get('--movie-id'),
    standardPool: args.includes('--standard-pool'),
  };
}

// ── Logger ────────────────────────────────────────────────────────────────────

function makeLogger() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    stream.write(line + '\n');
  }
  function close() { stream.end(); }
  return { log, close };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cli = parseCli();
  const env = loadEnv();
  const { log, close } = makeLogger();

  const supabaseUrl = env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) { log('❌  No SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in .env'); process.exit(1); }
  const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_KEY);

  // ── Fetch movies to process ──────────────────────────────────────────────

  let query = supabase.from('movies').select('id, title, year, director');

  if (cli.movieId) {
    query = query.eq('id', cli.movieId);
  } else if (cli.retryFailed) {
    query = query.or('safe_start.is.null,safe_start.eq.-1');
    if (cli.year) query = query.eq('year', cli.year);
    if (cli.standardPool) query = query.eq('standard_pool', true);
  } else {
    query = query.is('safe_start', null);
    if (cli.year) query = query.eq('year', cli.year);
    if (cli.standardPool) query = query.eq('standard_pool', true);
  }

  const { data: movies, error } = await query.order('year', { ascending: true });

  if (error) { log(`❌  Supabase error: ${error.message}`); process.exit(1); }
  if (!movies || movies.length === 0) {
    log('✅  Nothing to scan — all movies already have safe_start set.');
    close();
    return;
  }

  const batch = movies.slice(0, cli.limit);
  log(`\n${'─'.repeat(60)}`);
  log(`🎬  Batch scan starting — ${batch.length} movie(s) to process`);
  if (cli.dryRun) log(`    DRY RUN — no scans will run`);
  log(`${'─'.repeat(60)}`);

  // ── Process each movie ────────────────────────────────────────────────────

  let ok = 0, failed = 0, skipped = 0;

  for (let i = 0; i < batch.length; i++) {
    const movie = batch[i];
    const label = `[${i + 1}/${batch.length}]  "${movie.title}" (${movie.year})`;

    if (cli.dryRun) {
      log(`  ${label}  →  would scan  (tmdb_id=${movie.tmdb_id ?? 'none'})`);
      continue;
    }

    log(`\n${label}`);

    // Build args for scan-trailer.js
    const args = ['--update', '--movie', movie.title, '--year', String(movie.year)];
    if (movie.director) args.push('--director', movie.director);

    const result = spawnSync('node', [SCANNER, ...args], {
      stdio: 'inherit',   // pipe straight to terminal so user can watch live
      encoding: 'utf-8',
      timeout: 25 * 60 * 1000,  // 25-minute hard cap per movie
    });

    if (result.status === 0) {
      log(`  ✅  ${label}  →  done`);
      ok++;
    } else if (result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT') {
      log(`  ⏱  ${label}  →  timed out after 10 min — skipping`);
      // Mark as failed in DB so --retry-failed can pick it up; keep scan_status for retry
      await supabase.from('movies').update({ safe_start: -1, safe_end: -1 }).eq('id', movie.id);
      skipped++;
    } else {
      log(`  ❌  ${label}  →  exited with code ${result.status}`);
      if (result.status === 2) {
        // No clean window found — mark unusable so insane mode skips it
        await supabase.from('movies').update({ safe_start: -1, safe_end: -1, scan_status: 'unusable' }).eq('id', movie.id);
      } else {
        await supabase.from('movies').update({ safe_start: -1, safe_end: -1 }).eq('id', movie.id);
      }
      failed++;
    }

    // Brief pause between movies to be polite to APIs
    if (i < batch.length - 1) {
      log(`  ⏳  Waiting 3s before next movie…`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  log(`\n${'─'.repeat(60)}`);
  log(`📊  Batch complete`);
  log(`    ✅  Success:  ${ok}`);
  if (failed)  log(`    ❌  Failed:   ${failed}  (safe_start set to -1 — rerun with --retry-failed)`);
  if (skipped) log(`    ⏱  Timed out: ${skipped}`);
  log(`    Log: ${LOG_FILE}`);
  log(`${'─'.repeat(60)}\n`);

  close();
}

main().catch(err => { console.error('❌  Unexpected error:', err.message); process.exit(1); });
