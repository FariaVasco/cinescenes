import Svg, { Defs, ClipPath, Rect, Circle, Line, G, Path } from 'react-native-svg';

interface CinescenesMarkProps {
  size?: number;
  /** Remove rounded background (for icon export where OS applies its own mask) */
  squareBackground?: boolean;
}

const GOLD = 'rgba(245,197,24,';
const BG = '#0d0820';

/**
 * Cinescenes mark — clapperboard monogram, gold on dark.
 * viewBox 0 0 100 100 → scale via `size` prop.
 */
export function CinescenesMark({ size = 100, squareBackground = false }: CinescenesMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id="barClip">
          <Rect x="10" y="16" width="80" height="26" />
        </ClipPath>
      </Defs>

      {/* Background */}
      <Rect
        x="0" y="0" width="100" height="100"
        rx={squareBackground ? 0 : 18}
        fill={BG}
      />

      {/* ── Clapper bar ── */}
      {/* Stripe fill (clipped to bar rect) */}
      <G clipPath="url(#barClip)">
        {/* Faint background fill for the bar */}
        <Rect x="10" y="16" width="80" height="26" fill={`${GOLD}0.12)`} />
        {/* Diagonal stripes: lines from (x, 42) → (x+26, 16), stride 20, width 10 */}
        {[-10, 10, 30, 50, 70, 90, 110].map((x) => (
          <Line
            key={x}
            x1={x} y1={42}
            x2={x + 26} y2={16}
            stroke={`${GOLD}0.72)`}
            strokeWidth={10}
          />
        ))}
      </G>
      {/* Bar outline (on top of stripes) */}
      <Rect
        x="10" y="16" width="80" height="26"
        fill="none"
        stroke={`${GOLD}0.88)`}
        strokeWidth="2.5"
      />

      {/* ── Board body ── */}
      <Rect
        x="10" y="42" width="80" height="44"
        rx="4"
        fill={`${GOLD}0.07)`}
        stroke={`${GOLD}0.88)`}
        strokeWidth="2.5"
      />

      {/* ── Hinge pin ── */}
      <Circle
        cx="14" cy="42" r="4"
        fill={BG}
        stroke={`${GOLD}0.88)`}
        strokeWidth="2"
      />

      {/* ── Info lines on board ── */}
      <Line x1="20" y1="56" x2="62" y2="56" stroke={`${GOLD}0.5)`} strokeWidth="1.5" />
      <Line x1="20" y1="65" x2="62" y2="65" stroke={`${GOLD}0.5)`} strokeWidth="1.5" />
      <Line x1="20" y1="74" x2="46" y2="74" stroke={`${GOLD}0.5)`} strokeWidth="1.5" />
    </Svg>
  );
}
