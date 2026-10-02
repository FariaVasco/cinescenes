#!/usr/bin/env node
/**
 * Cinescenes — Printable Card Generator
 *
 * Fetches all validated Classic-pool movies from Supabase and outputs a print-ready HTML file
 * with front + back sides for physical game cards.
 *
 * Usage:
 *   node scripts/generate-cards.js           ← A4 sheets for home printing
 *   node scripts/generate-cards.js --print   ← one PNG per card face for the print shop
 *
 * Output (default):
 *   scripts/output/cards.html  ← open in browser → File → Print (A4, 100% scale)
 *   Card size: 63 × 63 mm (square), 3 × 4 per A4 sheet (12 cards/page)
 *   Printing:  Print fronts first, flip paper (long-edge), print backs
 *
 * Output (--print):
 *   scripts/output/print/NNN-front.png, NNN-back.png  ← upload to BoardGamesMaker
 *   scripts/output/print/preview/                      ← first few cards with cut/safe guides
 *   Product: 2.75" square cards (70 mm), rounded corners, unique front + back per card.
 *   Each PNG is the 896 × 896 px full-bleed canvas from the template (see PRINT below). Renders with the
 *   locally installed Google Chrome via puppeteer-core (override with CHROME_PATH).
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
const PRINT_DIR   = path.join(OUTPUT_DIR, 'print');

// ── Print-shop spec (BoardGamesMaker 2.75" square) ────────────────────────────
// Pixel sizes at 300 DPI, taken from BoardGamesMaker's 2.75" square template
// (2_75square.pdf): full-bleed canvas 896 px, cut line 830 px, safe area 759 px.
// Backgrounds run to the canvas edge; text, icons and the QR code stay inside
// the safe area.

const IN = 25.4; // mm per inch
const PRINT = {
  dpi:      300,
  px:       896, // full-bleed canvas — the size of every uploaded PNG
  cutPx:    830, // finished card after cutting
  safePx:   759, // keep text and important elements inside this
  cornerMm: 4,   // approximate rounded-corner radius, only used for preview guides
};
const pxToMm = px => (px / PRINT.dpi) * IN;
PRINT.canvasIn = PRINT.px / PRINT.dpi;                         // 2.99"
PRINT.canvasMm = pxToMm(PRINT.px);                             // ≈ 75.9 mm
PRINT.bleedMm  = pxToMm((PRINT.px - PRINT.cutPx) / 2);         // ≈ 2.8 mm (canvas edge → cut)
PRINT.insetMm  = pxToMm((PRINT.px - PRINT.safePx) / 2);        // ≈ 5.8 mm (canvas edge → safe)

const PREVIEW_COUNT = 6;

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

// ── Year colour palette ───────────────────────────────────────────────────────
// Decade anchors define the "main" colour for each era. Every individual year
// gets its own colour by linearly interpolating between the two surrounding
// anchors, so the step from year N to year N+1 is always identical in size
// (1/10 of the decade-to-decade distance) — no abrupt jumps at boundaries.

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

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function bg(year) {
  const d1 = Math.floor(year / 10) * 10;
  const d2 = d1 + 10;
  const c1 = DECADE[d1];
  const c2 = DECADE[d2];

  if (!c1 && !c2) return '#1a1a2e';
  if (!c1) return c2;
  if (!c2) return c1; // clamp — no anchor beyond last decade

  const t = (year - d1) / 10;
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  return rgbToHex(rgb1.map((v, i) => Math.round(v + (rgb2[i] - v) * t)));
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

// ── Card styles (shared by the A4 sheet and the print-shop export) ─────────────

const CARD_CSS = `
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
`;

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

    ${CARD_CSS}

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

// ── Print-shop export ─────────────────────────────────────────────────────────
// Same card markup as the A4 sheet, re-laid-out on the full-bleed canvas: the card
// shell grows to the canvas, backgrounds/strip extend into the bleed, and every
// positioned element is pushed inside the safe area. Sizes are scaled up ~10% from
// the 63 mm design since the cut card is 70 mm.

function printCss() {
  const c = PRINT.canvasMm;
  const s = PRINT.insetMm;              // safe inset from canvas edge
  const strip = s + 4.5;                // strip runs from the bleed edge up to 4.5 mm above safe
  return `
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      width: ${c}mm; height: ${c}mm; overflow: hidden;
      zoom: ${Math.ceil(PRINT.canvasIn * 96) / (PRINT.canvasIn * 96)};
    }

    .print .card {
      width: ${c}mm; height: ${c}mm;
      border-radius: 0; outline: none;
    }
    .print .ci { width: 8mm; height: 8mm; }
    .print .ci svg { width: 4.8mm; height: 4.8mm; }
    .print .ci-tl { top: ${s}mm; left: ${s}mm; }
    .print .ci-tr { top: ${s}mm; right: ${s}mm; }
    .print .ci-bl { bottom: ${strip + 1.5}mm; left: ${s}mm; }
    .print .ci-br { bottom: ${strip + 1.5}mm; right: ${s}mm; }

    .print .front-body { padding: ${s + 8.5}mm ${s + 1}mm ${strip + 6.5}mm; }
    .print .f-dir   { font-size: 9pt; }
    .print .f-year  { font-size: 49pt; }
    .print .f-title { font-size: 11pt; }
    .print .front-strip {
      height: ${strip}mm;
      padding-bottom: ${s}mm;
      border-radius: 0;
      font-size: 4.5pt;
    }

    .print .back .ci-bl, .print .back .ci-br { bottom: ${s}mm; }
    .print .qr-box { width: 44mm; height: 44mm; padding: 2.2mm; border-radius: 4.4mm; margin-bottom: 4.4mm; }
    .print .qr-img { width: 39.6mm; height: 39.6mm; image-rendering: pixelated; }
    .print .back-num { bottom: ${s + 1.5}mm; font-size: 4.5pt; }

    /* Preview-only guides: bleed edge = canvas edge, cut line, safe area. */
    .guide { position: absolute; z-index: 10; pointer-events: none; }
    .guide-cut  { inset: ${PRINT.bleedMm}mm; border: 0.3mm solid #00e5ff; border-radius: ${PRINT.cornerMm}mm; }
    .guide-safe { inset: ${s}mm; border: 0.3mm dashed #ff2d55; }
  `;
}

function printDocHtml(cardHtml, withGuides) {
  const guides = withGuides
    ? '<div class="guide guide-cut"></div><div class="guide guide-safe"></div>'
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
${CARD_CSS}
${printCss()}
</style></head>
<body class="print"><div style="position:relative">${cardHtml}${guides}</div></body></html>`;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) { console.error('Google Chrome not found — set CHROME_PATH'); process.exit(1); }
  return found;
}

async function renderPrintPngs(faces) {
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
  try {
    const page = await browser.newPage();
    // CSS px are 1/96": size the viewport to the canvas and scale to hit 300 DPI.
    // The mm-based canvas isn't a whole number of CSS px, so use a whole-px viewport
    // and zoom the layout by the remainder (see printCss) — the PNG is then exactly
    // PRINT.px square.
    const viewPx = Math.ceil(PRINT.canvasIn * 96);
    await page.setViewport({ width: viewPx, height: viewPx, deviceScaleFactor: PRINT.px / viewPx });

    fs.rmSync(PRINT_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.join(PRINT_DIR, 'preview'), { recursive: true });

    for (let i = 0; i < faces.length; i++) {
      const { name, html } = faces[i];
      process.stdout.write(`  [${String(i + 1).padStart(4)}/${faces.length}] ${name}\r`);
      await page.setContent(printDocHtml(html, false), { waitUntil: 'load' });
      await page.screenshot({ path: path.join(PRINT_DIR, `${name}.png`) });
      if (i < PREVIEW_COUNT * 2) {
        await page.setContent(printDocHtml(html, true), { waitUntil: 'load' });
        await page.screenshot({ path: path.join(PRINT_DIR, 'preview', `${name}.png`) });
      }
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const printMode = process.argv.includes('--print');
  const env = loadEnv();
  const url = env['EXPO_PUBLIC_SUPABASE_URL'];
  const key = env['EXPO_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) { console.error('Missing Supabase credentials in .env'); process.exit(1); }

  const supabase = createClient(url, key);

  console.log('Fetching validated Classic-pool movies from Supabase…');
  const { data: allMovies, error } = await supabase
    .from('movies')
    .select('id, title, year, director')
    .eq('scan_status', 'validated')
    .eq('classic_pool', true)
    .order('year', { ascending: true });

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  // --limit N renders only the first N cards (quick test runs).
  const limitArg = process.argv.indexOf('--limit');
  const movies = limitArg > -1 ? allMovies?.slice(0, Number(process.argv[limitArg + 1])) : allMovies;
  if (!movies?.length) { console.error('No validated Classic-pool movies found'); process.exit(1); }

  console.log(`Found ${movies.length} movies. Generating QR codes…`);

  const fronts = [];
  const backs  = [];

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${movies.length}] ${movie.year} — ${movie.title}\r`);

    const qr = await QRCode.toDataURL(`cinescenes://movie/${movie.id}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 600, // ≥300 DPI at the ~40 mm print size — plenty for scanning
      color: { dark: '#0a0a14', light: '#ffffff' },
    });

    fronts.push(frontHtml(movie));
    backs.push(backHtml(movie, qr, i + 1));
  }

  process.stdout.write('\n');

  if (printMode) {
    const pad = n => String(n).padStart(3, '0');
    const faces = [];
    for (let i = 0; i < movies.length; i++) {
      faces.push({ name: `${pad(i + 1)}-front`, html: fronts[i] });
      faces.push({ name: `${pad(i + 1)}-back`,  html: backs[i] });
    }
    console.log(`Rendering ${faces.length} PNGs (${PRINT.px} × ${PRINT.px} px, ${PRINT.dpi} DPI)…`);
    await renderPrintPngs(faces);
    console.log(`\n✓  ${movies.length} cards → ${PRINT_DIR}`);
    console.log(`   ${faces.length} files: NNN-front.png + NNN-back.png (same number = same card)`);
    console.log(`   Guide previews for the first ${PREVIEW_COUNT} cards → ${path.join(PRINT_DIR, 'preview')}`);
    console.log('   Upload the main folder only — the previews show the cut/safe lines.');
    return;
  }

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
