import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
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
    icon: '📅',
    title: 'Place It Right',
    body: 'Slot the card into your timeline — oldest on the left, newest on the right.',
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
        onScroll={handleScroll}
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
        {STEPS.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => goTo(i)}>
            <View style={[styles.dot, i === page && styles.dotActive]} />
          </TouchableOpacity>
        ))}
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
    backgroundColor: '#100a20',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: '#f5c518',
    fontSize: 22,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
  },
  pageCounter: {
    color: '#555',
    fontSize: 13,
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
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  stepBody: {
    color: '#9a9aaa',
    fontSize: 16,
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
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#f5c518',
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
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    backgroundColor: '#1e1630',
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  ctaButton: {
    flex: 1,
    backgroundColor: '#f5c518',
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#f5c518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0a0a0a',
    letterSpacing: 0.5,
  },
});
