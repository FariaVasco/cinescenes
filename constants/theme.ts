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
