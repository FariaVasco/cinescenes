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

interface TimelineProps {
  timeline: number[];
  currentCardMovie: Movie;
  interactive: boolean;
  selectedInterval: number | null;
  onIntervalSelect: (i: number) => void;
  onConfirm: () => void;
  placedInterval?: number | null;
  placedMovies?: Movie[];
  hideFloatingCard?: boolean;
  blockedIntervals?: number[];
  revealingMovie?: Movie;
}

export function Timeline({
  timeline,
  currentCardMovie,
  interactive,
  selectedInterval,
  onIntervalSelect,
  onConfirm,
  placedInterval,
  placedMovies,
  hideFloatingCard,
  blockedIntervals,
  revealingMovie,
}: TimelineProps) {
  // Build the display list: sorted years from timeline
  const sortedYears = [...timeline].sort((a, b) => a - b);

  // Determine where to show the unknown card
  // In interactive mode: at selectedInterval position (or at end if none selected)
  // In observer mode: at placedInterval position
  const showAtInterval = interactive ? selectedInterval : (placedInterval ?? null);

  function renderGap(index: number) {
    const isActive = showAtInterval === index;
    const isBlocked = interactive && blockedIntervals?.includes(index);

    if (isBlocked) {
      return (
        <View key={`gap-${index}`} style={styles.gapBlocked}>
          <Text style={styles.gapBlockedText}>✕</Text>
        </View>
      );
    }

    if (!interactive) {
      // Show card at this position if placedInterval matches
      if (placedInterval === index) {
        return (
          <View key={`gap-${index}`} style={styles.unknownCardSlot}>
            {revealingMovie
              ? <FlippingMovieCard movie={revealingMovie} width={80} height={100} autoFlip />
              : <CardBack width={80} height={100} />}
          </View>
        );
      }
      return <View key={`gap-${index}`} style={styles.gapSpacer} />;
    }

    // Interactive mode
    if (isActive) {
      return (
        <View key={`gap-${index}`} style={styles.activeGap}>
          {!hideFloatingCard && <CardBack width={80} height={100} />}
          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
            <Text style={styles.confirmBtnText}>Place Here</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={`gap-${index}`}
        style={styles.gapTap}
        onPress={() => onIntervalSelect(index)}
        hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
      >
        <View style={styles.gapArrow}>
          <Text style={styles.gapArrowText}>⌄</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function renderPlacedCard(year: number, idx: number) {
    const movie = placedMovies?.find((m) => m.year === year);
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
    items.push(
      <View key="unknown-pending" style={styles.unknownCardSlot}>
        <CardBack width={80} height={100} />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
    >
      {items}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  card: {
    width: 80,
    minHeight: 100,
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
  gapArrow: {
    width: 24,
    height: 24,
    borderRadius: R.full,
    backgroundColor: C.goldFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapArrowText: {
    color: C.gold,
    fontSize: FS.base,
    lineHeight: 18,
  },
  activeGap: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  unknownCardSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  confirmBtn: {
    backgroundColor: C.gold,
    borderRadius: R.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  confirmBtnText: {
    color: C.textOnGold,
    fontSize: FS.sm,
    fontWeight: '800',
  },
});
