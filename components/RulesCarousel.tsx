import { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { CinemaButton } from '@/components/CinemaButton';

const lcClapperboard = require('@/assets/lc-clapperboard.png');
const lcPopcorn      = require('@/assets/lc-popcorn.png');
const lcLightning    = require('@/assets/lc-lightning.png');
const lcCoin         = require('@/assets/lc-coin.png');
const lcMysteryCard  = require('@/assets/lc-mystery-card.png');
const lcHourglass    = require('@/assets/lc-hourglass.png');
const lcSpotlight    = require('@/assets/lc-spotlight.png');
const lcTrophy       = require('@/assets/lc-trophy.png');

export const RULES_STEPS = [
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

type Props = {
  /** If provided, the final slide shows a primary CTA that calls this. */
  onComplete?: () => void;
  /** Label for the final-slide CTA. Defaults to "Let's Play". */
  completeLabel?: string;
};

export function RulesCarousel({ onComplete, completeLabel = "Let's Play" }: Props) {
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  function handleScroll(e: any) {
    if (!width) return;
    const newPage = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newPage !== page) setPage(newPage);
  }

  function goTo(index: number) {
    if (!width) return;
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  }

  const isLast = page === RULES_STEPS.length - 1;

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
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
        {RULES_STEPS.map((step, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={[styles.stepBadge, { backgroundColor: step.accent }]}>
                  <Text style={styles.stepBadgeText}>{String(i + 1).padStart(2, '0')}</Text>
                </View>
                {typeof step.icon === 'string'
                  ? <Text style={styles.emoji}>{step.icon}</Text>
                  : <Image source={step.icon} style={styles.iconImg} />
                }
              </View>

              <View style={styles.cardRight}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

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

        <View style={styles.dots}>
          {RULES_STEPS.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = width
              ? scrollX.interpolate({ inputRange, outputRange: [7, 22, 7], extrapolate: 'clamp' })
              : 7;
            const dotColor = width
              ? scrollX.interpolate({ inputRange, outputRange: [C.inkFaint, C.ochre, C.inkFaint], extrapolate: 'clamp' })
              : C.inkFaint;
            return (
              <TouchableOpacity key={i} onPress={() => goTo(i)}>
                <Animated.View style={[styles.dot, { width: dotWidth, backgroundColor: dotColor as any }]} />
              </TouchableOpacity>
            );
          })}
        </View>

        {isLast && onComplete ? (
          <CinemaButton size="md" onPress={onComplete} style={styles.navBtn}>
            {completeLabel}
          </CinemaButton>
        ) : (
          <CinemaButton
            variant="primary"
            size="sm"
            onPress={() => goTo(page + 1)}
            disabled={isLast}
            style={[styles.navBtn, isLast && styles.navBtnHidden]}
          >
            Next →
          </CinemaButton>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },

  pager: { flex: 1 },

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
  },
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    padding: SP.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
  },
  cardLeft: {
    alignItems: 'center',
    gap: SP.sm,
    width: 90,
  },
  cardRight: {
    flex: 1,
    gap: 6,
  },
  stepBadge: {
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  stepBadgeText: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ink,
    letterSpacing: 1,
  },
  emoji: {
    fontSize: 52,
    textAlign: 'center',
  },
  iconImg: {
    width: 68,
    height: 68,
    resizeMode: 'contain',
  },
  stepTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.ink,
    letterSpacing: 0.5,
  },
  stepBody: {
    fontFamily: Fonts.body,
    fontSize: FS.base,
    color: C.textSub,
    lineHeight: 20,
  },

  dots: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.md,
    paddingBottom: 4,
    gap: SP.sm,
  },
  navBtn: { minWidth: 80 },
  navBtnHidden: { opacity: 0, pointerEvents: 'none' },
});
