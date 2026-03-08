/**
 * Cinescenes Design System Tokens
 * Single source of truth for colors, radii, type scale and spacing.
 */

/** Color palette */
export const C = {
  // ── Backgrounds ──────────────────────────────────────────
  bg:           '#100a20',   // primary page / screen background
  surface:      '#1e1630',   // cards, panels, inputs, chips
  surfaceHigh:  '#2a1f4a',   // modals, elevated panels, card sides

  // ── Brand ────────────────────────────────────────────────
  gold:         '#f5c518',
  goldFaint:    'rgba(245,197,24,0.12)',
  goldGlow:     'rgba(245,197,24,0.25)',

  // ── Semantic ─────────────────────────────────────────────
  danger:       '#e63946',

  // ── Text ─────────────────────────────────────────────────
  textPrimary:  '#ffffff',
  textSub:      '#a0a0b0',   // secondary / supporting text
  textMuted:    '#66667a',   // hints, captions, disabled
  textOnGold:   '#0a0a0a',   // text rendered on gold backgrounds

  // ── Borders ──────────────────────────────────────────────
  border:       'rgba(255,255,255,0.1)',
  borderSubtle: 'rgba(255,255,255,0.06)',
} as const;

/** Border radius scale */
export const R = {
  xs:   6,    // tiny badges, tags
  sm:   10,   // small interactive elements
  md:   12,   // inputs, minor cards
  btn:  16,   // primary action buttons
  card: 20,   // cards, panels, bottom sheets
  full: 999,  // circles / pills
} as const;

/** Font size scale */
export const FS = {
  micro:  9,
  xs:    11,
  sm:    12,
  base:  14,
  md:    16,
  lg:    18,
  xl:    22,
  '2xl': 28,
  hero:  40,
} as const;

/** Spacing scale */
export const SP = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

/** Card background color — linearly interpolated between decade anchors, matching physical cards */
const DECADE_COLORS: Record<number, string> = {
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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function cardColor(year: number): string {
  const d1 = Math.floor(year / 10) * 10;
  const d2 = d1 + 10;
  const c1 = DECADE_COLORS[d1];
  const c2 = DECADE_COLORS[d2];

  if (!c1 && !c2) return '#1a1a2e';
  if (!c1) return c2;
  if (!c2) return c1;

  const t = (year - d1) / 10;
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, '0');
  const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, '0');
  const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Named typography presets — mirrors the Figma text-* classes */
export const T = {
  hero:      { fontSize: FS.hero,  fontWeight: '900' as const, lineHeight: 44 },
  display:   { fontSize: FS['2xl'], fontWeight: '900' as const, lineHeight: 34, letterSpacing: 0.3 },
  title:     { fontSize: FS.xl,    fontWeight: '900' as const, lineHeight: 29, letterSpacing: 0.3 },
  subtitle:  { fontSize: FS.lg,    fontWeight: '700' as const, lineHeight: 25, letterSpacing: 0.3 },
  body:      { fontSize: FS.md,    fontWeight: '500' as const, lineHeight: 24, color: C.textSub },
  label:     { fontSize: FS.base,  fontWeight: '600' as const, lineHeight: 20, letterSpacing: 0.3 },
  overline:  { fontSize: FS.xs,    fontWeight: '700' as const, lineHeight: 14, letterSpacing: 2.0, textTransform: 'uppercase' as const, color: C.gold },
  caption:   { fontSize: FS.sm,    fontWeight: '500' as const, lineHeight: 17, letterSpacing: 0.3, color: C.textMuted },
  micro:     { fontSize: FS.micro, fontWeight: '700' as const, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.textMuted },
  wordmark:  { fontWeight: '900' as const, letterSpacing: 6, textTransform: 'uppercase' as const, color: C.gold },
} as const;
