import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Movie } from '@/lib/database.types';
import { C, R, FS } from '@/constants/theme';
import { FlippingMovieCard, CardBack, CardFront } from '@/components/MovieCard';

interface ChallengerCoin {
  interval: number;
  label: string; // display name
}

interface TimelineProps {
  timeline: number[];
  currentCardMovie: Movie;
  interactive: boolean;
  selectedInterval: number | null;
  onIntervalSelect: (i: number) => void;
  onConfirm: () => void;
  placedInterval?: number | null;
  placedLabel?: string;
  placedMovies?: Movie[];
  hideFloatingCard?: boolean;
  blockedIntervals?: number[];
  revealingMovie?: Movie;
  challengerPlacements?: ChallengerCoin[];
}

export interface TimelineHandle {
  measureGap: () => Promise<{ pageX: number; pageY: number; width: number; height: number } | null>;
}

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline({
  timeline,
  currentCardMovie,
  interactive,
  selectedInterval,
  onIntervalSelect,
  onConfirm,
  placedInterval,
  placedLabel = 'their pick',
  placedMovies,
  hideFloatingCard,
  blockedIntervals,
  revealingMovie,
  challengerPlacements,
}, ref) {
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const activeGapRef = useRef<View>(null);

  useImperativeHandle(ref, () => ({
    measureGap: () => new Promise((resolve) => {
      if (!activeGapRef.current) { resolve(null); return; }
      const timer = setTimeout(() => resolve(null), 200);
      activeGapRef.current.measure((_x, _y, width, height, pageX, pageY) => {
        clearTimeout(timer);
        resolve({ pageX, pageY, width, height });
      });
    }),
  }));

  // Auto-scroll to the placed card slot when switching to non-interactive mode
  useEffect(() => {
    if (!interactive && placedInterval !== null && placedInterval !== undefined) {
      // Each card is ~80px wide, each gap ~28px; estimate offset
      const CARD_W = 80;
      const GAP_W = 28;
      const PADDING = 16;
      // placedInterval gaps before it, and placedInterval cards before it
      const offset = PADDING + placedInterval * (CARD_W + GAP_W) - 60;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: Math.max(0, offset), animated: true });
      }, 100);
    }
  }, [interactive, placedInterval]);

  // Build the display list: sorted years from timeline
  const sortedYears = [...timeline].sort((a, b) => a - b);

  function renderGap(index: number) {
    // ── Active player's placed card — visible in all modes ──
    if (placedInterval === index) {
      if (revealingMovie) {
        return (
          <View key={`gap-${index}`} style={{ marginHorizontal: 24 }}>
            <FlippingMovieCard movie={revealingMovie} width={80} height={100} autoFlip />
          </View>
        );
      }
      return (
        <View key={`gap-${index}`} style={styles.placedMarkerWrap}>
          <Text style={styles.placedMarkerLabel}>{placedLabel}</Text>
          <CardBack width={80} height={100} outlined />
        </View>
      );
    }

    // ── Challenger coin — visible in all modes ──
    const coin = challengerPlacements?.find(c => c.interval === index);
    if (coin) {
      return (
        <View key={`gap-${index}`} style={styles.coinWrap}>
          <Text style={styles.coinLabel}>{coin.label}</Text>
          <View style={styles.coinCircle}>
            <Text style={styles.coinInitials}>{coin.label.slice(0, 2).toUpperCase()}</Text>
          </View>
        </View>
      );
    }

    if (!interactive) {
      return <View key={`gap-${index}`} style={styles.gapSpacer} />;
    }

    // ── Interactive: selected gap — dashed outline with confirm checkmark ──
    if (selectedInterval === index) {
      return (
        <View key={`gap-${index}`} ref={activeGapRef} style={styles.activeGap}>
          <View style={styles.cardPlaceholder}>
            <TouchableOpacity style={styles.confirmCheckmark} onPress={onConfirm} activeOpacity={0.7}>
              <Text style={styles.confirmCheckmarkText}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // ── Interactive: any remaining blocked gap ──
    if (blockedIntervals?.includes(index)) {
      return (
        <View key={`gap-${index}`} style={styles.gapBlocked}>
          <Text style={styles.gapBlockedText}>✕</Text>
        </View>
      );
    }

    // ── Interactive: open gap ──
    return (
      <TouchableOpacity
        key={`gap-${index}`}
        style={styles.gapTap}
        onPress={() => onIntervalSelect(index)}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        activeOpacity={0.6}
      >
        <View style={styles.gapPlusCircle}>
          <Text style={styles.gapPlusText}>+</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function renderPlacedCard(year: number, idx: number) {
    // Use index, not year-match — placedMovies is in the same sorted order as sortedYears,
    // so find(m => m.year === year) would return the wrong movie when two cards share a year.
    const movie = placedMovies?.[idx];
    if (movie) {
      return <CardFront key={`card-${idx}`} movie={movie} width={80} height={100} />;
    }
    return (
      <View key={`card-${idx}`} style={styles.card}>
        <Text style={styles.cardYear}>{year}</Text>
      </View>
    );
  }

  const items: React.ReactNode[] = [];

  // gap 0
  items.push(renderGap(0));

  for (let i = 0; i < sortedYears.length; i++) {
    items.push(renderPlacedCard(sortedYears[i], i));
    items.push(renderGap(i + 1));
  }

  // If no interval selected in interactive mode, show the card back at end (unless floating in parent)
  if (interactive && selectedInterval === null && !hideFloatingCard) {
    items.push(<CardBack key="unknown-pending" width={80} height={100} outlined />);
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
    >
      {items}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 4,
  },
  card: {
    width: 80,
    height: 100,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardYear: {
    color: C.gold,
    fontSize: FS.md,
    fontWeight: '800',
  },
  cardTitle: {
    color: C.textSub,
    fontSize: FS.micro,
    textAlign: 'center',
    lineHeight: 12,
  },
  placedMarkerWrap: {
    marginHorizontal: 24,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placedMarkerLabel: {
    position: 'absolute',
    top: -16,
    color: C.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  coinWrap: {
    marginHorizontal: 6,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinLabel: {
    position: 'absolute',
    top: -16,
    color: C.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  coinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.6)',
    backgroundColor: 'rgba(245,197,24,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinInitials: {
    color: C.gold,
    fontSize: FS.xs,
    fontWeight: '800',
  },
  gapSpacer: {
    width: 20,
  },
  gapBlocked: {
    width: 28,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapBlockedText: {
    color: 'rgba(230,57,70,0.45)',
    fontSize: FS.xs,
    fontWeight: '700',
  },
  gapTap: {
    width: 32,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapPlusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.5)',
    backgroundColor: 'rgba(245,197,24,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapPlusText: {
    color: 'rgba(245,197,24,0.8)',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '400',
    includeFontPadding: false,
  },
  activeGap: {
    width: 80,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dashed card placeholder shown when a gap is selected
  cardPlaceholder: {
    width: 80,
    height: 100,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.6)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,197,24,0.04)',
  },
  confirmCheckmark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(245,197,24,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCheckmarkText: {
    color: 'rgba(245,197,24,0.9)',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
});
