#!/usr/bin/env node
/**
 * Cinescenes — Interactive Trailer Review
 *
 * Starts a local web server and opens a browser UI where you can watch
 * each trailer and mark it as Keep, Replace, or Skip.
 *
 *   K / Enter  = ✅ Keep (trailer is fine)
 *   R / X      = ❌ Replace (has ads, wrong movie, private, etc.)
 *   S          = ⏭ Skip (undecided — come back later)
 *
 * Decisions are saved to scripts/output/trailer-review.json after every
 * click. Run again to resume — already-decided movies are skipped.
 *
 * Usage:
 *   node scripts/review-trailers.js                # all movies with a youtube_id
 *   node scripts/review-trailers.js --year 2020    # one year at a time
 *   node scripts/review-trailers.js --reset        # clear decisions and start over
 */

'use strict';

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const PORT           = 3333;
const OUTPUT_DIR     = path.join(__dirname, 'output');
const DECISIONS_FILE = path.join(OUTPUT_DIR, 'trailer-review.json');

// ─── env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const f = path.join(__dirname, '../.env');
  if (!fs.existsSync(f)) { console.error('No .env at project root'); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

// ─── cli ─────────────────────────────────────────────────────────────────────

function parseCli() {
  const args = process.argv.slice(2);
  const get  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  return {
    year:  get('--year') ? parseInt(get('--year'), 10) : null,
    reset: args.includes('--reset'),
  };
}

// ─── decisions ───────────────────────────────────────────────────────────────

function loadDecisions() {
  try {
    return fs.existsSync(DECISIONS_FILE)
      ? JSON.parse(fs.readFileSync(DECISIONS_FILE, 'utf-8'))
      : {};
  } catch { return {}; }
}

function saveDecision(decisions, movie, action) {
  decisions[movie.id] = {
    action,
    title:     movie.title,
    year:      movie.year,
    youtubeId: movie.youtubeId,
    tmdbId:    movie.tmdbId ?? null,
    timestamp: new Date().toISOString(),
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(DECISIONS_FILE, JSON.stringify(decisions, null, 2));
}

// ─── terminal summary (shown on Ctrl-C or when all done) ─────────────────────

function printSummary(decisions) {
  const all     = Object.values(decisions);
  const replace = all.filter(d => d.action === 'replace');
  const keep    = all.filter(d => d.action === 'keep');
  const skip    = all.filter(d => d.action === 'skip');

  console.log('\n' + '═'.repeat(60));
  console.log('  TRAILER REVIEW SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✅  Kept:      ${String(keep.length).padStart(4)}`);
  console.log(`  ❌  Replace:   ${String(replace.length).padStart(4)}`);
  console.log(`  ⏭   Skipped:   ${String(skip.length).padStart(4)}`);

  if (replace.length > 0) {
    console.log('\n  Movies flagged for replacement:');
    for (const d of replace) {
      const fix = d.tmdbId
        ? `→  node scripts/scan-trailer.js --tmdb-id ${d.tmdbId} --update`
        : `→  node scripts/audit-trailers.js  (to find TMDb ID)`;
      console.log(`    - ${d.title} (${d.year})  [${d.youtubeId}]`);
      console.log(`         ${fix}`);
    }
  }

  console.log('\n  Full data: ' + DECISIONS_FILE);
  console.log('═'.repeat(60) + '\n');
}

// ─── HTML page ───────────────────────────────────────────────────────────────

function buildHTML(movies, decisions) {
  const moviesJson    = JSON.stringify(movies);
  const decisionsJson = JSON.stringify(decisions);

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Trailer Review — Cinescenes</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0a; color: #f0ebe3;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  }
  .topbar {
    width: 100%; max-width: 900px;
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 24px;
  }
  .logo { font-size: 11px; color: #555; letter-spacing: 2px; text-transform: uppercase; }
  .prog-text { font-size: 13px; color: #888; }
  .prog-wrap { width: 100%; max-width: 900px; padding: 0 24px 14px; }
  .prog-bar  { height: 3px; background: #1e1e1e; border-radius: 2px; overflow: hidden; }
  .prog-fill { height: 100%; background: #d4a843; border-radius: 2px; transition: width .4s ease; }
  .player-wrap { width: 100%; max-width: 900px; padding: 0 24px; }
  .player-inner {
    position: relative; padding-bottom: 56.25%;
    background: #111; border-radius: 10px; overflow: hidden;
    border: 1px solid #1e1e1e;
  }
  iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
  .meta {
    width: 100%; max-width: 900px;
    padding: 12px 24px 4px;
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  }
  .mtitle   { font-size: 19px; font-weight: 600; }
  .myear    { font-size: 15px; color: #d4a843; }
  .mdir     { font-size: 13px; color: #777; }
  .badge    {
    font-size: 10px; padding: 2px 8px; border-radius: 10px;
    text-transform: uppercase; letter-spacing: .8px; font-weight: 600;
  }
  .badge-validated   { background: #1a3d1a; color: #5acc5a; border: 1px solid #2e6b2e; }
  .badge-unvalidated { background: #2a2200; color: #d4a843; border: 1px solid #4a3d00; }
  .badge-unusable    { background: #3d1a1a; color: #e74c3c; border: 1px solid #6b2e2e; }
  .yt-link  { font-size: 12px; color: #444; text-decoration: none; margin-left: auto; }
  .yt-link:hover { color: #d4a843; }
  .hint {
    width: 100%; max-width: 900px; padding: 4px 24px 8px;
    font-size: 12px; color: #444; line-height: 1.5;
  }
  .actions { width: 100%; max-width: 900px; padding: 10px 24px 32px; display: flex; gap: 10px; }
  .btn {
    flex: 1; padding: 13px 16px; border: none; border-radius: 10px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: filter .12s;
  }
  .btn:hover  { filter: brightness(1.15); }
  .btn:active { filter: brightness(.9); transform: scale(.98); }
  .btn-keep    { background: #1e3a1e; color: #5acc5a; border: 2px solid #2a5c2a; }
  .btn-replace { background: #3a1e1e; color: #cc5a5a; border: 2px solid #5c2a2a; }
  .btn-skip    { background: #1a1a1a; color: #666;    border: 2px solid #2a2a2a; }
  .key { font-size: 10px; opacity: .4; font-weight: 400; }
  /* summary */
  .summary { width: 100%; max-width: 900px; padding: 48px 24px; text-align: center; }
  .summary h2 { font-size: 24px; margin-bottom: 8px; }
  .sub { color: #666; margin-bottom: 28px; }
  .rlist { text-align: left; }
  .ri {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 14px; background: #111;
    border-radius: 8px; border: 1px solid #1e1e1e; margin-bottom: 8px;
  }
  .ri a   { color: #d4a843; text-decoration: none; font-size: 12px; }
  .ri a:hover { text-decoration: underline; }
  code {
    font-family: 'SF Mono', Monaco, monospace; font-size: 11px;
    background: #161616; padding: 3px 7px; border-radius: 4px;
    color: #aaa; display: block; margin-top: 5px;
  }
  .all-good { color: #5acc5a; padding: 32px; text-align: center; font-size: 16px; }
</style>
</head>
<body>

<div class="topbar">
  <span class="logo">🎬 Cinescenes — Trailer Review</span>
  <span class="prog-text" id="pt">Loading…</span>
</div>
<div class="prog-wrap">
  <div class="prog-bar"><div class="prog-fill" id="pf" style="width:0"></div></div>
</div>

<div id="reviewScreen">
  <div class="player-wrap">
    <div class="player-inner">
      <iframe id="player" src="" allow="autoplay; encrypted-media" allowfullscreen></iframe>
    </div>
  </div>
  <div class="meta">
    <span class="mtitle" id="mTitle"></span>
    <span class="myear"  id="mYear"></span>
    <span class="mdir"   id="mDir"></span>
    <span class="badge"  id="mBadge"></span>
    <a class="yt-link" id="mLink" href="#" target="_blank">open in YouTube ↗</a>
  </div>
  <p class="hint">Watch the first 10–15 seconds. If there's an ad, a wrong film, or the title is shown — press <strong>Replace</strong>.</p>
  <div class="actions">
    <button class="btn btn-keep"    onclick="decide('keep')"   >✅ Keep    <span class="key">K / Enter</span></button>
    <button class="btn btn-replace" onclick="decide('replace')">❌ Replace <span class="key">R / X</span></button>
    <button class="btn btn-skip"    onclick="decide('skip')"   >⏭ Skip    <span class="key">S</span></button>
  </div>
</div>

<div id="doneScreen" style="display:none">
  <div class="summary">
    <div style="font-size:48px;margin-bottom:12px">🎉</div>
    <h2>Review Complete</h2>
    <p class="sub" id="doneSub"></p>
    <div class="rlist" id="doneList"></div>
  </div>
</div>

<script>
const MOVIES    = ${moviesJson};
const DECISIONS = ${decisionsJson};  // persisted from file at page load

// Queue = movies not yet finalised (skip = "come back later", still in queue)
const finalized = new Set(
  Object.entries(DECISIONS).filter(([, v]) => v.action !== 'skip').map(([k]) => k)
);
const queue   = MOVIES.filter(m => !finalized.has(m.id));
const session = {};   // { [movieId]: 'keep' | 'replace' | 'skip' } — this browser session
let idx = 0;

// ── progress ──────────────────────────────────────────────────────────────────
function finCount() {
  const persisted = Object.values(DECISIONS).filter(d => d.action !== 'skip').length;
  const sessionFin = Object.values(session).filter(a => a !== 'skip').length;
  return persisted + sessionFin;
}
function updateProg() {
  const n = finCount();
  document.getElementById('pt').textContent = n + ' / ' + MOVIES.length + ' reviewed';
  document.getElementById('pf').style.width = (MOVIES.length ? (n / MOVIES.length * 100) : 0).toFixed(1) + '%';
}

// ── show a movie ──────────────────────────────────────────────────────────────
function showMovie(m) {
  document.getElementById('mTitle').textContent = m.title;
  document.getElementById('mYear').textContent  = m.year;
  document.getElementById('mDir').textContent   = m.director ? '· ' + m.director : '';
  const badge = document.getElementById('mBadge');
  badge.textContent = m.scanStatus;
  badge.className   = 'badge badge-' + (m.scanStatus || 'unvalidated');
  const link = document.getElementById('mLink');
  link.href = 'https://youtu.be/' + m.youtubeId;
  // Autoplay from start (t=0) so you catch any pre-roll ads
  document.getElementById('player').src =
    'https://www.youtube-nocookie.com/embed/' + m.youtubeId +
    '?autoplay=1&rel=0&modestbranding=1';
}

// ── advance to next undecided ─────────────────────────────────────────────────
function advance() {
  while (idx < queue.length && session[queue[idx].id] && session[queue[idx].id] !== 'skip') idx++;
  if (idx >= queue.length) { showDone(); return; }
  showMovie(queue[idx]);
  updateProg();
}

// ── record a decision ─────────────────────────────────────────────────────────
async function decide(action) {
  if (idx >= queue.length) return;
  const m = queue[idx++];
  session[m.id] = action;
  document.getElementById('player').src = '';   // stop video immediately
  try {
    await fetch('/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieId: m.id, action }),
    });
  } catch (_) { /* offline? decisions still in session */ }
  advance();
}

// ── summary screen ────────────────────────────────────────────────────────────
function showDone() {
  document.getElementById('reviewScreen').style.display = 'none';
  document.getElementById('doneScreen').style.display   = 'block';
  document.getElementById('pf').style.width = '100%';
  document.getElementById('pt').textContent = 'All done!';

  // Collect replace decisions from persisted + session
  const toReplace = MOVIES.filter(m => {
    const s = session[m.id];
    const p = DECISIONS[m.id]?.action;
    return s === 'replace' || (!s && p === 'replace');
  });

  document.getElementById('doneSub').textContent =
    toReplace.length
      ? toReplace.length + ' trailer(s) flagged for replacement — see list below.'
      : 'No trailers flagged for replacement.';

  const list = document.getElementById('doneList');
  if (toReplace.length === 0) {
    list.innerHTML = '<p class="all-good">All trailers look good! ✅</p>';
  } else {
    list.innerHTML = toReplace.map(m => {
      const cmd = m.tmdbId
        ? \`node scripts/scan-trailer.js --tmdb-id \${m.tmdbId} --update\`
        : \`node scripts/audit-trailers.js  # find TMDb ID first\`;
      return \`<div class="ri">
        <div style="flex:1">
          <strong>\${m.title}</strong> <span style="color:#888">(\${m.year})</span>
          <div><a href="https://youtu.be/\${m.youtubeId}" target="_blank">youtu.be/\${m.youtubeId}</a></div>
          <code>\${cmd}</code>
        </div>
      </div>\`;
    }).join('');
  }
}

// ── keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'k' || e.key === 'K' || e.key === 'Enter') decide('keep');
  else if (e.key === 'r' || e.key === 'R' || e.key === 'x' || e.key === 'X') decide('replace');
  else if (e.key === 's' || e.key === 'S') decide('skip');
});

// ── init ──────────────────────────────────────────────────────────────────────
updateProg();
advance();
</script>
</body>
</html>`;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cli = parseCli();
  const env = loadEnv();

  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey  = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('❌  EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be in .env');
    process.exit(1);
  }

  if (cli.reset) {
    if (fs.existsSync(DECISIONS_FILE)) {
      fs.unlinkSync(DECISIONS_FILE);
      console.log('🗑  Previous decisions cleared.');
    } else {
      console.log('Nothing to reset.');
    }
  }

  // ── fetch movies ────────────────────────────────────────────────────────────

  const db = createClient(supabaseUrl, serviceKey);
  let q = db.from('movies')
    .select('id, title, year, director, youtube_id, scan_status, safe_start, tmdb_id')
    .not('youtube_id', 'is', null)
    .order('year', { ascending: true });
  if (cli.year) q = q.eq('year', cli.year);

  const { data: rows, error } = await q;
  if (error) { console.error('❌  Supabase:', error.message); process.exit(1); }
  if (!rows?.length) { console.log('No movies with a youtube_id found.'); return; }

  // Normalise for the browser (camelCase)
  const movies = rows.map(m => ({
    id:         m.id,
    title:      m.title,
    year:       m.year,
    director:   m.director ?? '',
    youtubeId:  m.youtube_id,
    scanStatus: m.scan_status ?? 'unvalidated',
    safeStart:  m.safe_start ?? null,
    tmdbId:     m.tmdb_id ?? null,
  }));

  const decisions  = loadDecisions();
  const remaining  = movies.filter(m => !decisions[m.id] || decisions[m.id].action === 'skip');
  const prevCount  = Object.keys(decisions).length;

  console.log(`\n🎬  ${movies.length} trailers in scope`);
  console.log(`    ${remaining.length} left to review`);
  if (prevCount > 0) {
    console.log(`    (${prevCount} already decided — run with --reset to start over)`);
  }

  // ── HTTP server ─────────────────────────────────────────────────────────────

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildHTML(movies, decisions));

    } else if (req.method === 'POST' && req.url === '/decide') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try {
          const { movieId, action } = JSON.parse(body);
          const movie = movies.find(m => m.id === movieId);
          if (movie && action) saveDecision(decisions, movie, action);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });

    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Print summary on Ctrl-C
  process.on('SIGINT', () => {
    console.log('\n');
    printSummary(loadDecisions());
    server.close(() => process.exit(0));
  });

  server.listen(PORT, () => {
    console.log(`\n🌐  http://localhost:${PORT}`);
    console.log('    K / Enter = keep   R / X = replace   S = skip');
    console.log('    Ctrl-C to stop and print summary\n');
    exec(`open http://localhost:${PORT}`);
  });
}

main().catch(err => { console.error('❌  Fatal:', err.message); process.exit(1); });
