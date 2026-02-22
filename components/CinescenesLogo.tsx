import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line, G, Defs, ClipPath } from 'react-native-svg';

interface Props {
  /** Height of the clapperboard icon in dp */
  iconSize?: number;
  /** Show the CINESCENES wordmark below/beside the icon */
  showWordmark?: boolean;
  /** Stack icon above wordmark, or place them side-by-side */
  layout?: 'vertical' | 'horizontal';
}

// viewBox: 52 × 56 — clapperboard, flat design, brand colours
function ClapperIcon({ size }: { size: number }) {
  const w = 52;
  const h = 56;
  return (
    <Svg width={size * (w / h)} height={size} viewBox={`0 0 ${w} ${h}`} fill="none">
      <Defs>
        <ClipPath id="clapTop">
          <Rect x="1" y="1" width="50" height="20" rx="3" />
        </ClipPath>
      </Defs>

      {/* ── Clapper top bar (yellow) ── */}
      <Rect x="1" y="1" width="50" height="20" rx="3" fill="#f5c518" />

      {/* ── Diagonal stripes clipped to top bar ── */}
      <G clipPath="url(#clapTop)">
        <Line x1="-4"  y1="1" x2="19" y2="21" stroke="#0a0a14" strokeWidth="7" />
        <Line x1="6"   y1="1" x2="29" y2="21" stroke="#0a0a14" strokeWidth="7" />
        <Line x1="16"  y1="1" x2="39" y2="21" stroke="#0a0a14" strokeWidth="7" />
        <Line x1="26"  y1="1" x2="49" y2="21" stroke="#0a0a14" strokeWidth="7" />
        <Line x1="36"  y1="1" x2="59" y2="21" stroke="#0a0a14" strokeWidth="7" />
      </G>

      {/* ── Hinge pins ── */}
      <Circle cx="8"  cy="10" r="3.5" fill="#0a0a14" />
      <Circle cx="44" cy="10" r="3.5" fill="#0a0a14" />

      {/* ── Board body ── */}
      <Rect x="1" y="20" width="50" height="35" rx="4"
        fill="#0a0a14" stroke="#f5c518" strokeWidth="2" />

      {/* ── Left sprocket holes ── */}
      <Rect x="1"  y="28" width="6" height="8" rx="2" fill="#f5c518" />
      <Rect x="1"  y="40" width="6" height="8" rx="2" fill="#f5c518" />

      {/* ── Right sprocket holes ── */}
      <Rect x="45" y="28" width="6" height="8" rx="2" fill="#f5c518" />
      <Rect x="45" y="40" width="6" height="8" rx="2" fill="#f5c518" />
    </Svg>
  );
}

export function CinescenesLogo({
  iconSize = 48,
  showWordmark = true,
  layout = 'vertical',
}: Props) {
  if (layout === 'horizontal') {
    return (
      <View style={styles.horizontal}>
        <ClapperIcon size={iconSize} />
        {showWordmark && (
          <View style={styles.wordmarkBlock}>
            <Text style={[styles.wordmark, { fontSize: iconSize * 0.6 }]}>
              CINESCENES
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.vertical}>
      <ClapperIcon size={iconSize} />
      {showWordmark && (
        <Text style={[styles.wordmark, { fontSize: iconSize * 0.5, marginTop: iconSize * 0.1 }]}>
          CINESCENES
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vertical: {
    alignItems: 'center',
  },
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  wordmarkBlock: {
    justifyContent: 'center',
  },
  wordmark: {
    fontWeight: '900',
    color: '#f5c518',
    letterSpacing: 6,
    textShadowColor: 'rgba(245,197,24,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
});
