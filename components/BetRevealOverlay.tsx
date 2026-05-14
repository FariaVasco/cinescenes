import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, ActivityIndicator } from 'react-native';
import { C, R, FS, Fonts } from '@/constants/theme';

export function BetRevealRow({ emoji, name, intervalText }: { emoji: string; name: string; intervalText: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 9, tension: 120, useNativeDriver: true }),
    ]).start();
  }, []);
  const isPass = intervalText === 'Passed';
  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.rowEmoji}>{emoji}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{name}</Text>
        <Text style={[styles.rowInterval, isPass && styles.rowIntervalPass]}>{intervalText}</Text>
      </View>
    </Animated.View>
  );
}

export function BetRevealOverlay({ rows, revealCount }: { rows: Array<{ emoji: string; name: string; intervalText: string }>; revealCount: number }) {
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(bgOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(titleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);
  const allShown = revealCount >= rows.length && rows.length > 0;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: bgOpacity }]}>
      <Animated.View style={[styles.content, { opacity: titleOpacity }]}>
        <Text style={styles.title}>All bets are in</Text>
        <Text style={styles.subtitle}>Let's see what everyone picked…</Text>
      </Animated.View>
      <View style={styles.rows}>
        {rows.slice(0, revealCount).map((r, i) => (
          <BetRevealRow key={i} emoji={r.emoji} name={r.name} intervalText={r.intervalText} />
        ))}
      </View>
      {allShown && (
        <View style={styles.flippingRow}>
          <ActivityIndicator size="small" color={C.gold} />
          <Text style={styles.flippingText}>Flipping the card…</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', paddingHorizontal: 28, gap: 6 },
  content: { alignItems: 'center', marginBottom: 20 },
  title: { color: C.ochre, fontFamily: Fonts.display, fontSize: FS.xl, letterSpacing: 0.3 },
  subtitle: { color: C.textSubDark, fontFamily: Fonts.body, fontSize: FS.sm, marginTop: 4 },
  rows: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inkSurface, borderRadius: R.card, paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  rowEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowName: { color: C.textPrimaryDark, fontFamily: Fonts.bodyBold, fontSize: FS.base },
  rowInterval: { color: C.ochre, fontFamily: Fonts.label, fontSize: FS.sm, marginTop: 1 },
  rowIntervalPass: { color: C.textMutedDark },
  flippingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  flippingText: { color: C.textSubDark, fontFamily: Fonts.body, fontSize: FS.sm },
});
