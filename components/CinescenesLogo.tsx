import { View, Text, Image, StyleSheet } from 'react-native';
import { C, Fonts } from '@/constants/theme';

const lcClapperboard = require('@/assets/lc-clapperboard.png');

interface Props {
  iconSize?: number;
  showWordmark?: boolean;
  layout?: 'vertical' | 'horizontal';
  dark?: boolean; // render on dark background (trailer, scanner)
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
        <Image source={lcClapperboard} style={{ width: iconSize, height: iconSize, resizeMode: 'contain' }} />
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
      <Image source={lcClapperboard} style={{ width: iconSize, height: iconSize, resizeMode: 'contain' }} />
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
    paddingHorizontal: 8,
  },
});
