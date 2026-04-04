import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line, G, Defs, ClipPath } from 'react-native-svg';
import { C, Fonts } from '@/constants/theme';

interface Props {
  iconSize?: number;
  showWordmark?: boolean;
  layout?: 'vertical' | 'horizontal';
  dark?: boolean; // render on dark background (trailer, scanner)
}

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

      {/* Clapper top bar */}
      <Rect x="1" y="1" width="50" height="20" rx="3" fill="#F5C518" />

      {/* Diagonal stripes */}
      <G clipPath="url(#clapTop)">
        <Line x1="-4"  y1="1" x2="19" y2="21" stroke="#1A1A1A" strokeWidth="7" />
        <Line x1="6"   y1="1" x2="29" y2="21" stroke="#1A1A1A" strokeWidth="7" />
        <Line x1="16"  y1="1" x2="39" y2="21" stroke="#1A1A1A" strokeWidth="7" />
        <Line x1="26"  y1="1" x2="49" y2="21" stroke="#1A1A1A" strokeWidth="7" />
        <Line x1="36"  y1="1" x2="59" y2="21" stroke="#1A1A1A" strokeWidth="7" />
      </G>

      {/* Hinge pins */}
      <Circle cx="8"  cy="10" r="3.5" fill="#1A1A1A" />
      <Circle cx="44" cy="10" r="3.5" fill="#1A1A1A" />

      {/* Board body */}
      <Rect x="1" y="20" width="50" height="35" rx="4"
        fill="#1A1A1A" stroke="#F5C518" strokeWidth="2" />

      {/* Sprocket holes */}
      <Rect x="1"  y="28" width="6" height="8" rx="2" fill="#F5C518" />
      <Rect x="1"  y="40" width="6" height="8" rx="2" fill="#F5C518" />
      <Rect x="45" y="28" width="6" height="8" rx="2" fill="#F5C518" />
      <Rect x="45" y="40" width="6" height="8" rx="2" fill="#F5C518" />
    </Svg>
  );
}

export function CinescenesLogo({
  iconSize = 48,
  showWordmark = true,
  layout = 'vertical',
  dark = false,
}: Props) {
  const wordmarkColor = dark ? C.textPrimaryDark : C.ink;

  if (layout === 'horizontal') {
    return (
      <View style={styles.horizontal}>
        <ClapperIcon size={iconSize} />
        {showWordmark && (
          <Text style={[styles.wordmark, { fontSize: iconSize * 0.6, color: wordmarkColor }]}>
            CINESCENES
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.vertical}>
      <ClapperIcon size={iconSize} />
      {showWordmark && (
        <Text style={[styles.wordmark, { fontSize: iconSize * 0.5, marginTop: iconSize * 0.1, color: wordmarkColor }]}>
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
  wordmark: {
    fontFamily: Fonts.display,
    letterSpacing: 6,
  },
});
