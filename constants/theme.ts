/**
 * Cinescenes Design System — Ligne Claire
 * Single source of truth for colors, radii, typography and spacing.
 *
 * Palette naming follows the source material:
 *   ink        — the universal stroke / outline (#1A1A1A)
 *   parchment  — warm cream background (#FAFAF7)
 *   vermillion — brand red  (#E8372A)
 *   ochre      — brand yellow/gold (#F5C518)
 *   cerulean   — accent blue (#4A9EC4)
 */

// ─────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────
export const Fonts = {
  display:   'Bangers_400Regular',      // headlines, wordmark, big buttons
  body:      'ComicNeue_400Regular',    // UI body text, names, descriptions
  bodyBold:  'ComicNeue_700Bold',       // bold body text
  label:     'PatrickHand_400Regular',  // tags, captions, tracked small text
} as const;

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────
export const C = {
  // ── Light surfaces (default) ──────────────────────────────
  bg:           '#C8BFA8',   // warm aged parchment — app background
  surface:      '#FFFFFF',   // cards, panels, inputs
  surfaceHigh:  '#D9D0BE',   // nav bars, footers, secondary surfaces

  // ── Dark contexts (trailer, scanner, camera) ──────────────
  inkBg:        '#1A1A1A',   // deep ink — dark screen background
  inkSurface:   '#2A2A2A',   // dark cards / panels on inkBg
  inkSurfaceHigh: '#333333', // elevated dark surfaces

  // ── Ligne Claire Palette ──────────────────────────────────
  vermillion:   '#E8372A',   // secondary buttons, danger, highlights
  ochre:        '#F5C518',   // primary buttons, coins, score
  cerulean:     '#4A9EC4',   // informational, observer, focus state
  leaf:         '#3DAA5C',   // correct answer, positive result

  // ── Ink / Stroke ─────────────────────────────────────────
  ink:          '#1A1A1A',   // the ligne claire stroke — 2px everywhere
  inkSoft:      'rgba(26,26,26,0.35)',
  inkFaint:     'rgba(26,26,26,0.12)',

  // ── Text (light surfaces) ────────────────────────────────
  textPrimary:  '#1A1A1A',
  textSub:      '#5A5A5A',
  textMuted:    '#9A9A9A',
  textOnOchre:  '#1A1A1A',   // text on ochre/yellow backgrounds
  textOnRed:    '#FFFFFF',   // text on vermillion backgrounds
  textOnDark:   '#FAFAF7',   // text on inkBg

  // ── Text (dark surfaces) ─────────────────────────────────
  textPrimaryDark: '#FAFAF7',
  textSubDark:     '#B0ADA6',
  textMutedDark:   '#6A6A6A',

  // ── Borders ──────────────────────────────────────────────
  border:       '#1A1A1A',              // 2px ligne claire stroke
  borderLight:  'rgba(26,26,26,0.12)',  // hairline dividers (not stroke-weight)

  // ── Legacy aliases (kept for gradual screen migration) ───
  gold:         '#F5C518',              // → ochre
  goldFaint:    'rgba(245,197,24,0.10)',
  goldGlow:     'rgba(245,197,24,0.18)',
  danger:       '#E8372A',              // → vermillion
  textOnGold:   '#1A1A1A',             // → textOnOchre
} as const;

// ─────────────────────────────────────────────────────────────
// Border radius scale
// ─────────────────────────────────────────────────────────────
export const R = {
  xs:    6,    // tags, badges, small chips
  sm:    10,   // small interactive elements, inputs
  md:    12,   // standard buttons
  btn:   12,   // primary action buttons
  card:  14,   // cards, list items, game tiles
  sheet: 18,   // bottom sheets, modals, large panels
  full:  999,  // avatar circles, pill labels
} as const;

// ─────────────────────────────────────────────────────────────
// Font size scale
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Spacing scale
// ─────────────────────────────────────────────────────────────
export const SP = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

// ─────────────────────────────────────────────────────────────
// Typography presets
// ─────────────────────────────────────────────────────────────
export const T = {
  hero:     { fontFamily: Fonts.display, fontSize: FS.hero,   lineHeight: 44, paddingHorizontal: 6 },
  display:  { fontFamily: Fonts.display, fontSize: FS['2xl'], lineHeight: 34, letterSpacing: 0.5, paddingHorizontal: 5 },
  title:    { fontFamily: Fonts.display, fontSize: FS.xl,     lineHeight: 29, letterSpacing: 0.5, paddingHorizontal: 4 },
  subtitle: { fontFamily: Fonts.bodyBold, fontSize: FS.lg,    lineHeight: 25 },
  body:     { fontFamily: Fonts.body,    fontSize: FS.md,     lineHeight: 24, color: C.textSub },
  label:    { fontFamily: Fonts.label,   fontSize: FS.base,   lineHeight: 20, letterSpacing: 0.3 },
  overline: { fontFamily: Fonts.label,   fontSize: FS.xs,     lineHeight: 14, letterSpacing: 2.0, textTransform: 'uppercase' as const, color: C.ochre },
  caption:  { fontFamily: Fonts.label,   fontSize: FS.sm,     lineHeight: 17, letterSpacing: 0.3, color: C.textMuted },
  micro:    { fontFamily: Fonts.label,   fontSize: FS.micro,  lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.textMuted },
  wordmark: { fontFamily: Fonts.display, letterSpacing: 6,    textTransform: 'uppercase' as const, color: C.ochre },
} as const;

// ─────────────────────────────────────────────────────────────
// Card decade colors
// Background color of movie cards, decade-coded (used on card backs)
// ─────────────────────────────────────────────────────────────
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
