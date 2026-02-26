import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { C, R, FS } from '@/constants/theme';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';

const STEPS = [
  {
    icon: '🎬',
    title: 'Draw a Card',
    body: 'Scan the QR on a physical Cinescenes card, or pick one randomly from the digital deck.',
    glow: 'rgba(245,197,24,0.14)',
  },
  {
    icon: '👀',
    title: 'Watch the Clip',
    body: 'No title. No year. Just the movie. Study every frame — each second is a clue.',
    glow: 'rgba(24,197,197,0.12)',
  },
  {
    icon: '⚡',
    title: 'Know It? Say It',
    body: 'Tap "I know it!" to skip straight to guessing. Or let the clip run to the end — your call.',
    glow: 'rgba(245,130,24,0.12)',
  },
  {
    icon: '🪙',
    title: 'Earn Coins',
    body: 'Everyone starts with 2 coins. Correctly name the movie AND its director out loud before the reveal and earn a coin from each player who got it wrong.',
    glow: 'rgba(245,197,24,0.18)',
  },
  {
    icon: '🎴',
    title: 'Your Starting Card',
    body: 'Every player begins with one card already on their timeline. On your first turn it\'s simple — the new card goes either before or after that one.',
    glow: 'rgba(24,197,130,0.12)',
  },
  {
    icon: '📅',
    title: 'Place It Right',
    body: 'Slot the card into your timeline — oldest on the left, newest on the right. The more cards you collect, the trickier it gets!',
    glow: 'rgba(24,130,245,0.12)',
  },
  {
    icon: '⚔️',
    title: 'Challenge!',
    body: "After the active player places their card, everyone else has 5 seconds to challenge. Think they got it wrong? Tap Challenge and pick where YOU think the card belongs.",
    glow: 'rgba(230,57,70,0.14)',
  },
  {
    icon: '🃏',
    title: 'The Reveal',
    body: "The card flips and the correct year is shown. If the active player was right, they keep the card. If a challenger was right, the card goes to them instead. If nobody was right, the card is trashed.",
    glow: 'rgba(24,130,245,0.12)',
  },
  {
    icon: '🎯',
    title: 'Keep or Lose',
    body: 'Correct year? The card stays on your timeline. Wrong? It goes back to the deck.',
    glow: 'rgba(245,24,80,0.10)',
  },
  {
    icon: '🏆',
    title: 'Race to Win',
    body: 'Agree on a card target before you start. First player to place that many correctly wins!',
    glow: 'rgba(245,197,24,0.20)',
  },
];

export default function RulesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  function handleScroll(e: any) {
    const newPage = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newPage !== page) setPage(newPage);
  }

  function goTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  }

  const isLast = page === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HOW TO PLAY</Text>
        <View style={styles.headerBtn}>
          <Text style={styles.pageCounter}>{page + 1} / {STEPS.length}</Text>
        </View>
      </View>

      {/* ── Swipeable slides ── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleScroll }
        )}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {STEPS.map((step, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            {/* Emoji glow */}
            <View style={[styles.emojiGlow, { backgroundColor: step.glow }]} />
            <Text style={styles.emoji}>{step.icon}</Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ── Dot indicators ── */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({ inputRange, outputRange: [7, 22, 7], extrapolate: 'clamp' });
          const dotColor = scrollX.interpolate({
            inputRange,
            outputRange: ['rgba(255,255,255,0.15)', '#f5c518', 'rgba(255,255,255,0.15)'],
            extrapolate: 'clamp',
          });
          return (
            <TouchableOpacity key={i} onPress={() => goTo(i)}>
              <Animated.View style={[styles.dot, { width: dotWidth, backgroundColor: dotColor }]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Navigation + CTA ── */}
      <View style={styles.nav}>
        <TouchableOpacity
          style={[styles.navBtn, page === 0 && styles.navBtnHidden]}
          onPress={() => goTo(page - 1)}
          disabled={page === 0}
        >
          <Text style={styles.navBtnText}>← Prev</Text>
        </TouchableOpacity>

        {isLast ? (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/play')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Let's Play  →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextBtn} onPress={() => goTo(page + 1)}>
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderSubtle,
  },
  headerBtn: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: C.gold,
    fontSize: 30,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  headerTitle: {
    color: C.textPrimary,
    fontSize: FS.xs,
    fontWeight: '900',
    letterSpacing: 4,
  },
  pageCounter: {
    color: C.textMuted,
    fontSize: FS.sm,
    fontWeight: '600',
  },

  // ── Pager ──
  pager: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 20,
    paddingBottom: 20,
  },
  emojiGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  emoji: {
    fontSize: 96,
    textAlign: 'center',
  },
  stepTitle: {
    color: C.textPrimary,
    fontSize: FS['2xl'],
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  stepBody: {
    color: C.textSub,
    fontSize: FS.md,
    lineHeight: 24,
    textAlign: 'center',
  },

  // ── Dots ──
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.borderSubtle,
  },
  dotActive: {
    width: 22,
    backgroundColor: C.gold,
  },

  // ── Navigation ──
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 12,
  },
  navBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  navBtnHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  navBtnText: {
    color: C.textMuted,
    fontSize: FS.base,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.card,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  nextBtnText: {
    color: C.textPrimary,
    fontSize: FS.md,
    fontWeight: '700',
  },
  ctaButton: {
    flex: 1,
    backgroundColor: C.gold,
    borderRadius: R.card,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaText: {
    fontSize: FS.md,
    fontWeight: '900',
    color: C.textOnGold,
    letterSpacing: 0.5,
  },
});
