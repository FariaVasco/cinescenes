#!/usr/bin/env node
/**
 * Cinescenes — Printable Card Generator
 *
 * Fetches all active movies from Supabase and outputs a print-ready HTML file
 * with front + back sides for physical game cards.
 *
 * Usage:
 *   node scripts/generate-cards.js
 *
 * Output:
 *   scripts/output/cards.html  ← open in browser → File → Print (A4, 100% scale)
 *
 * Card size: 63 × 63 mm (square)
 * Grid:      3 × 4 per A4 sheet (12 cards/page)
 * Printing:  Print fronts first, flip paper (long-edge), print backs
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

// ── Paths ─────────────────────────────────────────────────────────────────────

const ENV_FILE    = path.join(__dirname, '../.env');
const OUTPUT_DIR  = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cards.html');

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

// ── Decade palette ────────────────────────────────────────────────────────────

const DECADE = {
  1920: '#3D2B1F', // warm sepia        — silent era
  1930: '#1B3252', // deep navy         — noir / art deco
  1940: '#4A1522', // dark burgundy     — wartime
  1950: '#0C5E3E', // deep teal         — Technicolor
  1960: '#7A1E00', // vermillion        — New Wave / revolution
  1970: '#7A3C00', // burnt sienna      — New Hollywood
  1980: '#380066', // deep violet       — neon / blockbuster
  1990: '#003E5C', // ocean blue        — indie / Sundance
  2000: '#1B3D1B', // forest green      — CGI / digital
  2010: '#1B1B3D', // midnight indigo   — streaming
  2020: '#2D0A3D', // deep plum         — modern
};

function bg(year) {
  const d = Math.floor(year / 10) * 10;
  return DECADE[d] || '#1a1a2e';
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
// Four cinema icons used at card corners — solid-fill so they stay crisp at
// small print sizes. No external fonts or images required.

// Clapperboard
const IC_CLAPPER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M4 5a1 1 0 0 0-1 1v1h18V6a1 1 0 0 0-1-1H4zM3 9v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H3z"/>
  <path d="M5 5h2l1.5 3H6.5L5 5zm4 0h2l1.5 3h-2L9 5zm4 0h2l1.5 3h-2L13 5z" fill="rgba(255,255,255,0.55)"/>
</svg>`;

// Film reel
const IC_REEL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2a8 8 0 0 1 8 8 8 8 0 0 1-8 8 8 8 0 0 1-8-8 8 8 0 0 1 8-8zm0 3a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5zm0 3a2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2z"/>
  <circle cx="12" cy="4.5" r="1.2"/>
  <circle cx="19.1" cy="8.5" r="1.2"/>
  <circle cx="19.1" cy="15.5" r="1.2"/>
  <circle cx="12" cy="19.5" r="1.2"/>
  <circle cx="4.9" cy="15.5" r="1.2"/>
  <circle cx="4.9" cy="8.5" r="1.2"/>
</svg>`;

// Video camera
const IC_CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4V6.5l-4 4z"/>
</svg>`;

// Five-pointed star
const IC_STAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
</svg>`;

// Corner order: top-left, top-right, bottom-left, bottom-right
const ICONS = [IC_CLAPPER, IC_REEL, IC_CAMERA, IC_STAR];

// ── HTML helpers ──────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ci(top|bottom, left|right, svgString, colorVar)
function ci(v, h, svg, colorCss) {
  return `<div class="ci ci-${v}${h}" style="color:${colorCss}">${svg}</div>`;
}

// ── Card generators ───────────────────────────────────────────────────────────

function frontHtml(movie) {
  const color = bg(movie.year);
  return `
<div class="card front" style="background-color:${color}">
  <div class="front-glow"></div>
  ${ci('t','l', ICONS[0], 'rgba(255,255,255,0.75)')}
  ${ci('t','r', ICONS[1], 'rgba(255,255,255,0.75)')}
  ${ci('b','l', ICONS[2], 'rgba(255,255,255,0.75)')}
  ${ci('b','r', ICONS[3], 'rgba(255,255,255,0.75)')}
  <div class="front-body">
    <p class="f-dir">${esc(movie.director)}</p>
    <p class="f-year">${movie.year}</p>
    <p class="f-title">${esc(movie.title)}</p>
  </div>
  <div class="front-strip">CINESCENES</div>
</div>`;
}

function backHtml(movie, qrDataUrl, num) {
  return `
<div class="card back">
  ${ci('t','l', ICONS[0], 'rgba(245,197,24,0.6)')}
  ${ci('t','r', ICONS[1], 'rgba(245,197,24,0.6)')}
  ${ci('b','l', ICONS[2], 'rgba(245,197,24,0.6)')}
  ${ci('b','r', ICONS[3], 'rgba(245,197,24,0.6)')}
  <div class="qr-box">
    <img class="qr-img" src="${qrDataUrl}" alt="${esc(movie.title)}"/>
  </div>
  <p class="back-num">Cinescenes #${num}</p>
</div>`;
}

// ── Full HTML document ────────────────────────────────────────────────────────

function buildHtml(fronts, backs, total) {
  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const fp = chunk(fronts, 12);
  const bp = chunk(backs,  12);
  const tp = fp.length + bp.length;

  const pages = (list, cls) =>
    list.map(cards => `<div class="page ${cls}">${cards.join('')}</div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cinescenes — Printable Cards</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Screen ───────────────────────────────────── */
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #06040e;
      color: #fff;
      padding: 32px 20px;
    }
    .hdr { text-align: center; margin-bottom: 40px; }
    .hdr h1 {
      font-size: 28px; font-weight: 900; letter-spacing: 8px; color: #f5c518;
      text-shadow: 0 0 20px rgba(245,197,24,0.35); margin-bottom: 10px;
    }
    .hdr p { font-size: 13px; color: #555; line-height: 2; }
    .hdr strong { color: #999; }
    .lbl {
      font-size: 10px; letter-spacing: 3px; text-transform: uppercase;
      color: #333; text-align: center; margin: 40px 0 14px;
    }

    /* ── Card grid page (4 rows × 3 cols = 12 per A4) ── */
    .page {
      display: grid;
      grid-template-columns: repeat(3, 63mm);
      grid-auto-rows: 63mm;
      gap: 2mm;
      padding: 6mm;
      background: #e8e8e8;
      width: fit-content;
      margin: 0 auto 24px;
    }

    /* ── Card shell (square) ──────────────────────── */
    .card {
      width: 63mm;
      height: 63mm;
      border-radius: 3.5mm;
      overflow: hidden;
      position: relative;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      outline: 0.25mm solid rgba(0,0,0,0.2);
    }

    /* ── Corner icons (shared) ────────────────────── */
    .ci {
      position: absolute;
      width: 7.5mm; height: 7.5mm;
      border-radius: 50%;
      background: rgba(0,0,0,0.2);
      display: flex; align-items: center; justify-content: center;
      z-index: 2;
    }
    .ci svg { width: 4.5mm; height: 4.5mm; display: block; }
    .ci-tl { top: 2mm;   left: 2mm;  }
    .ci-tr { top: 2mm;   right: 2mm; }
    /* bottom icons sit just above the strip / label */
    .ci-bl { bottom: 6mm; left: 2mm;  }
    .ci-br { bottom: 6mm; right: 2mm; }

    /* ── Front ────────────────────────────────────── */
    .front {
      display: flex;
      flex-direction: column;
    }
    .front-glow {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.12) 0%, transparent 68%);
      pointer-events: none; z-index: 0;
    }
    .front-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      /* top: clear icons (2mm + 7.5mm + 0.5mm gap = 10mm)
         bottom: clear bottom icons (6mm) + strip (4.5mm) + 0.5mm gap = 11mm */
      padding: 10mm 4mm 11mm;
      position: relative; z-index: 1;
    }
    .f-dir {
      font-size: 8pt;
      font-weight: 600;
      font-style: italic;
      color: rgba(255,255,255,0.85);
      text-align: center;
      line-height: 1.35;
    }
    .f-year {
      font-size: 44pt;
      font-weight: 900;
      color: #fff;
      line-height: 1;
      letter-spacing: -0.5pt;
      text-align: center;
      text-shadow: 0 3px 12px rgba(0,0,0,0.3);
    }
    .f-title {
      font-size: 10pt;
      font-weight: 700;
      font-style: italic;
      color: rgba(255,255,255,0.9);
      text-align: center;
      line-height: 1.35;
    }
    .front-strip {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 4.5mm;
      background: rgba(0,0,0,0.28);
      display: flex; align-items: center; justify-content: center;
      font-size: 4pt;
      font-weight: 700;
      color: rgba(255,255,255,0.45);
      letter-spacing: 3pt;
      border-radius: 0 0 3.5mm 3.5mm;
      z-index: 1;
    }

    /* ── Back ─────────────────────────────────────── */
    .back {
      background: #100a20;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* back corner icons: subtle gold-tinted circle */
    .back .ci { background: rgba(245,197,24,0.1); }
    /* back bottom icons sit just above the number label */
    .back .ci-bl, .back .ci-br { bottom: 3.5mm; }
    .qr-box {
      width: 40mm; height: 40mm;
      background: #fff;
      border-radius: 4mm;
      padding: 2mm;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      position: relative; z-index: 1;
      /* shift up slightly to make room for number label */
      margin-bottom: 4mm;
    }
    .qr-img { width: 36mm; height: 36mm; display: block; }
    .back-num {
      position: absolute;
      bottom: 1.5mm; left: 0; right: 0;
      text-align: center;
      font-size: 4pt;
      font-weight: 600;
      color: rgba(255,255,255,0.28);
      letter-spacing: 1.5pt;
      text-transform: uppercase;
      z-index: 1;
    }

    /* ── Print ────────────────────────────────────── */
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body   { background: white; padding: 0; }
      .hdr, .lbl { display: none; }
      .page {
        margin: 0; padding: 6mm;
        background: white;
        page-break-after: always;
      }
      .page:last-child { page-break-after: avoid; }
      .qr-img { image-rendering: crisp-edges; }
    }
  </style>
</head>
<body>

<div class="hdr">
  <h1>CINESCENES</h1>
  <p>
    <strong>${total} cards</strong> &nbsp;·&nbsp; ${tp} pages<br>
    Print pages 1–${fp.length} (fronts) &nbsp;→&nbsp; flip paper (long edge) &nbsp;→&nbsp; print pages ${fp.length + 1}–${tp} (backs)
  </p>
</div>

<div class="lbl">▶ Card fronts — pages 1 to ${fp.length}</div>
${pages(fp, 'fronts')}

<div class="lbl">▶ Card backs — pages ${fp.length + 1} to ${tp} &nbsp;(same card order — print on reverse side)</div>
${pages(bp, 'backs')}

</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = loadEnv();
  const url = env['EXPO_PUBLIC_SUPABASE_URL'];
  const key = env['EXPO_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) { console.error('Missing Supabase credentials in .env'); process.exit(1); }

  const supabase = createClient(url, key);

  console.log('Fetching active movies from Supabase…');
  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, title, year, director')
    .eq('active', true)
    .order('year', { ascending: true });

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  if (!movies?.length) { console.error('No active movies found'); process.exit(1); }

  console.log(`Found ${movies.length} movies. Generating QR codes…`);

  const fronts = [];
  const backs  = [];

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${movies.length}] ${movie.year} — ${movie.title}\r`);

    const qr = await QRCode.toDataURL(`cinescenes://movie/${movie.id}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 500, // ~270 DPI at 44mm print size — plenty for scanning
      color: { dark: '#0a0a14', light: '#ffffff' },
    });

    fronts.push(frontHtml(movie));
    backs.push(backHtml(movie, qr, i + 1));
  }

  process.stdout.write('\n');
  console.log('Building HTML…');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const html = buildHtml(fronts, backs, movies.length);
  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');

  const kb = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
  console.log(`\n✓  ${movies.length} cards → ${OUTPUT_FILE}  (${kb} KB)\n`);
  console.log('How to print:');
  console.log('  1. Open scripts/output/cards.html in Chrome or Safari');
  console.log('  2. File → Print — Paper: A4, Scale: 100%, no scaling, no headers/footers');
  console.log(`  3. Print pages 1–${Math.ceil(movies.length / 12)} (fronts only)`);
  console.log('  4. Flip paper (long-edge flip) and print remaining pages (backs)');
  console.log('  5. Cut along hairline borders — each card is 63 × 63 mm');
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
