import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Animated,
} from 'react-native';

const lcClapperboard = require('@/assets/lc-clapperboard.png');
const lcPopcorn      = require('@/assets/lc-popcorn.png');
const lcLightning    = require('@/assets/lc-lightning.png');
const lcCoin         = require('@/assets/lc-coin.png');
const lcMysteryCard  = require('@/assets/lc-mystery-card.png');
const lcHourglass    = require('@/assets/lc-hourglass.png');
const lcSpotlight    = require('@/assets/lc-spotlight.png');
const lcTrophy       = require('@/assets/lc-trophy.png');
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';

const STEPS = [
  {
    icon: lcClapperboard,
    title: 'Draw a Card',
    body: 'Scan the QR on a physical Cinescenes card, or pick one randomly from the digital deck.',
    accent: C.ochre,
  },
  {
    icon: lcPopcorn,
    title: 'Watch the Clip',
    body: 'No title. No year. Just the movie. Study every frame — each second is a clue.',
    accent: C.cerulean,
  },
  {
    icon: lcLightning,
    title: 'Know It? Say It',
    body: 'Tap "I know it!" to skip straight to guessing. Or let the clip run to the end — your call.',
    accent: C.vermillion,
  },
  {
    icon: lcCoin,
    title: 'Earn Coins',
    body: 'Everyone starts with 2 coins. Correctly name the movie AND its director out loud before the reveal and earn a coin from each player who got it wrong.',
    accent: C.ochre,
  },
  {
    icon: lcMysteryCard,
    title: 'Your Starting Card',
    body: "Every player begins with one card already on their timeline. On your first turn it's simple — the new card goes either before or after that one.",
    accent: C.leaf,
  },
  {
    icon: lcHourglass,
    title: 'Place It Right',
    body: 'Slot the card into your timeline — oldest on the left, newest on the right. The more cards you collect, the trickier it gets!',
    accent: C.cerulean,
  },
  {
    icon: '⚔️',
    title: 'Challenge!',
    body: 'After the active player places their card, everyone else has 5 seconds to challenge. Think they got it wrong? Tap Challenge and pick where YOU think the card belongs.',
    accent: C.vermillion,
  },
  {
    icon: lcSpotlight,
    title: 'The Reveal',
    body: "The card flips and the correct year is shown. If the active player was right, they keep the card. If a challenger was right, the card goes to them instead. If nobody was right, the card is trashed.",
    accent: C.cerulean,
  },
  {
    icon: '🎯',
    title: 'Keep or Lose',
    body: 'Correct year? The card stays on your timeline. Wrong? It goes back to the deck.',
    accent: C.vermillion,
  },
  {
    icon: lcTrophy,
    title: 'Race to Win',
    body: 'Agree on a card target before you start. First player to place that many correctly wins!',
    accent: C.ochre,
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

      {/* Header */}
      <View style={styles.header}>
        <BackButton
          onPress={() => router.back()}
          style={{ marginHorizontal: 0, marginTop: 0 }}
        />

        <Text style={styles.headerTitle}>How to Play</Text>

        <Text style={styles.pageCounter}>{page + 1} / {STEPS.length}</Text>
      </View>

      {/* Swipeable slides */}
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
        contentContainerStyle={styles.pagerContent}
      >
        {STEPS.map((step, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={styles.card}>
              {/* Accent top bar */}
              <View style={[styles.cardAccentBar, { backgroundColor: step.accent }]} />

              {/* Step badge */}
              <View style={[styles.stepBadge, { backgroundColor: step.accent }]}>
                <Text style={styles.stepBadgeText}>{String(i + 1).padStart(2, '0')}</Text>
              </View>

              {typeof step.icon === 'string'
                ? <Text style={styles.emoji}>{step.icon}</Text>
                : <Image source={step.icon} style={styles.iconImg} />
              }
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [7, 22, 7],
            extrapolate: 'clamp',
          });
          const dotColor = scrollX.interpolate({
            inputRange,
            outputRange: [C.inkFaint, C.ochre, C.inkFaint],
            extrapolate: 'clamp',
          });
          return (
            <TouchableOpacity key={i} onPress={() => goTo(i)}>
              <Animated.View style={[styles.dot, { width: dotWidth, backgroundColor: dotColor }]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Navigation */}
      <View style={styles.nav}>
        <CinemaButton
          variant="ghost"
          size="sm"
          onPress={() => goTo(page - 1)}
          disabled={page === 0}
          style={[styles.navBtn, page === 0 && styles.navBtnHidden]}
        >
          ← Prev
        </CinemaButton>

        {isLast ? (
          <CinemaButton size="lg" onPress={() => router.push('/play')} style={styles.navFlex}>
            Let's Play
          </CinemaButton>
        ) : (
          <CinemaButton variant="ghost" size="md" onPress={() => goTo(page + 1)} style={styles.navFlex}>
            Next →
          </CinemaButton>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: C.inkFaint,
  },
  backBtn: {
    width: 56,
    alignItems: 'flex-start',
  },
  backArrow: {
    fontFamily: Fonts.label,
    fontSize: FS.lg,
    color: C.textSub,
  },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.ink,
    letterSpacing: 0.5,
  },
  pageCounter: {
    width: 56,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: C.textMuted,
    textAlign: 'right',
  },

  // Pager
  pager: {
    flex: 1,
  },
  pagerContent: {
    alignItems: 'center',
  },

  // Slide
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  card: {
    width: '100%',
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.ink,
    borderRadius: R.card,
    padding: SP.lg,
    alignItems: 'center',
    gap: SP.sm,
    overflow: 'hidden',
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  stepBadge: {
    borderRadius: R.full,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: SP.xs,
    marginBottom: SP.xs,
  },
  stepBadgeText: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ink,
    letterSpacing: 1,
  },
  emoji: {
    fontSize: 72,
    textAlign: 'center',
  },
  iconImg: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  stepTitle: {
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    color: C.ink,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  stepBody: {
    fontFamily: Fonts.body,
    fontSize: FS.md,
    color: C.textSub,
    lineHeight: 26,
    textAlign: 'center',
  },

  // Dots
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SP.sm,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },

  // Navigation
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.lg,
    paddingBottom: SP.sm,
    gap: SP.sm,
  },
  navBtn: {
    minWidth: 80,
  },
  navBtnHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  navFlex: {
    flex: 1,
  },
});
