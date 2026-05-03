#!/usr/bin/env node
/**
 * Cinescenes — Game Data Cleanup
 *
 * Deletes all transient game data (challenges, turns, players, games) for
 * games that have finished or been cancelled, once they are old enough that
 * no client could still be looking at them.
 *
 * Tables that are NEVER touched: movies, profiles, collections, reports.
 *
 * Deletion order respects FK constraints:
 *   challenges  (→ turns, players)
 *   turns       (→ games, players)
 *   players     (→ games)
 *   games
 *
 * Usage:
 *   node scripts/cleanup-games.js                    # clean finished/cancelled games > 2h old
 *   node scripts/cleanup-games.js --grace-hours 6    # extend grace period
 *   node scripts/cleanup-games.js --dry-run          # show what would be deleted, don't delete
 *   node scripts/cleanup-games.js --game-id <uuid>   # clean a single specific game (ignores grace)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ENV_FILE = path.join(__dirname, '../.env');
const LOG_FILE = path.join(__dirname, 'output/cleanup-games.log');

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) { console.error('No .env at project root'); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, graceHours: 2, gameId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run')                   opts.dryRun = true;
    if (args[i] === '--grace-hours' && args[i+1])  opts.graceHours = Number(args[++i]);
    if (args[i] === '--game-id'     && args[i+1])  opts.gameId = args[++i];
  }
  return opts;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const env  = loadEnv();

  const supabaseUrl = env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) { log('❌  No SUPABASE_URL in .env'); process.exit(1); }
  if (!env.SUPABASE_SERVICE_KEY) { log('❌  No SUPABASE_SERVICE_KEY in .env'); process.exit(1); }

  const db = createClient(supabaseUrl, env.SUPABASE_SERVICE_KEY);

  log('═══════════════════════════════════════════════');
  log(`🧹  Cinescenes cleanup${opts.dryRun ? ' (DRY RUN)' : ''}`);
  if (opts.gameId) {
    log(`   Mode: single game  ${opts.gameId}`);
  } else {
    log(`   Mode: all finished/cancelled games older than ${opts.graceHours}h`);
  }
  log('═══════════════════════════════════════════════');

  // ── 1. Find target games ────────────────────────────────────────────────────

  let gamesQuery = db
    .from('games')
    .select('id, status, game_code, created_at')
    .in('status', ['finished', 'cancelled']);

  if (opts.gameId) {
    gamesQuery = gamesQuery.eq('id', opts.gameId);
  } else {
    const cutoff = new Date(Date.now() - opts.graceHours * 60 * 60 * 1000).toISOString();
    gamesQuery = gamesQuery.lt('created_at', cutoff);
  }

  const { data: games, error: gamesErr } = await gamesQuery;
  if (gamesErr) { log(`❌  Failed to fetch games: ${gamesErr.message}`); process.exit(1); }
  if (!games || games.length === 0) { log('✅  Nothing to clean up.'); return; }

  log(`🎯  Found ${games.length} game(s) to clean:`);
  for (const g of games) {
    log(`   • ${g.id}  [${g.status}]  code=${g.game_code}  created=${g.created_at}`);
  }

  if (opts.dryRun) { log('\n⚠️   Dry run — no data was deleted.'); return; }

  const gameIds = games.map(g => g.id);

  // ── 2. Find turn IDs for these games (needed to delete challenges) ──────────

  const { data: turns, error: turnsErr } = await db
    .from('turns')
    .select('id')
    .in('game_id', gameIds);
  if (turnsErr) { log(`❌  Failed to fetch turns: ${turnsErr.message}`); process.exit(1); }
  const turnIds = (turns ?? []).map(t => t.id);

  // ── 3. Delete challenges ────────────────────────────────────────────────────

  if (turnIds.length > 0) {
    const { error, count } = await db
      .from('challenges')
      .delete({ count: 'exact' })
      .in('turn_id', turnIds);
    if (error) { log(`❌  challenges delete failed: ${error.message}`); process.exit(1); }
    log(`🗑️   Deleted ${count ?? '?'} challenge(s)`);
  } else {
    log('   No turns found — skipping challenges');
  }

  // ── 4. Delete turns ─────────────────────────────────────────────────────────

  const { error: tErr, count: tCount } = await db
    .from('turns')
    .delete({ count: 'exact' })
    .in('game_id', gameIds);
  if (tErr) { log(`❌  turns delete failed: ${tErr.message}`); process.exit(1); }
  log(`🗑️   Deleted ${tCount ?? '?'} turn(s)`);

  // ── 5. Delete players ───────────────────────────────────────────────────────

  const { error: pErr, count: pCount } = await db
    .from('players')
    .delete({ count: 'exact' })
    .in('game_id', gameIds);
  if (pErr) { log(`❌  players delete failed: ${pErr.message}`); process.exit(1); }
  log(`🗑️   Deleted ${pCount ?? '?'} player row(s)`);

  // ── 6. Delete games ─────────────────────────────────────────────────────────

  const { error: gErr, count: gCount } = await db
    .from('games')
    .delete({ count: 'exact' })
    .in('id', gameIds);
  if (gErr) { log(`❌  games delete failed: ${gErr.message}`); process.exit(1); }
  log(`🗑️   Deleted ${gCount ?? '?'} game(s)`);

  log('✅  Cleanup complete.');
}

main().catch(err => { log(`💥  Unexpected error: ${err.message}`); process.exit(1); });
