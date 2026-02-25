import { useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Movie } from '@/lib/database.types';

interface TimelineProps {
  timeline: number[];
  currentCardMovie: Movie;
  interactive: boolean;
  selectedInterval: number | null;
  onIntervalSelect: (i: number) => void;
  onConfirm: () => void;
  placedInterval?: number | null;
  placedMovies?: Array<{ year: number; title: string }>;
  hideFloatingCard?: boolean;
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
}: TimelineProps) {
  // Build the display list: sorted years from timeline
  const sortedYears = [...timeline].sort((a, b) => a - b);

  // Determine where to show the unknown card
  // In interactive mode: at selectedInterval position (or at end if none selected)
  // In observer mode: at placedInterval position
  const showAtInterval = interactive ? selectedInterval : (placedInterval ?? null);

  // Build list of "slots": each slot is either a placed card or the gap indicator
  // We have N placed cards and N+1 gaps (0..N)
  const totalCards = sortedYears.length;

  function renderGap(index: number) {
    const isActive = showAtInterval === index;

    if (!interactive) {
      // Show unknown card at this position if placedInterval matches
      if (placedInterval === index) {
        return (
          <View key={`gap-${index}`} style={styles.unknownCardSlot}>
            <UnknownCard />
          </View>
        );
      }
      return <View key={`gap-${index}`} style={styles.gapSpacer} />;
    }

    // Interactive mode
    if (isActive) {
      return (
        <View key={`gap-${index}`} style={styles.activeGap}>
          {!hideFloatingCard && <UnknownCard />}
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
    const title = placedMovies?.find((m) => m.year === year)?.title;
    return (
      <View key={`card-${idx}`} style={styles.card}>
        <Text style={styles.cardYear}>{year}</Text>
        {title ? (
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
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

  // If no interval selected in interactive mode, show the unknown card at end (unless floating in parent)
  if (interactive && selectedInterval === null && !hideFloatingCard) {
    items.push(
      <View key="unknown-pending" style={styles.unknownCardSlot}>
        <UnknownCard />
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

function UnknownCard() {
  return (
    <View style={styles.unknownCard}>
      <Text style={styles.unknownCardIcon}>🎬</Text>
      <Text style={styles.unknownCardLabel}>?</Text>
    </View>
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
    backgroundColor: '#1e1630',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardYear: {
    color: '#f5c518',
    fontSize: 16,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#999',
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 12,
  },
  gapSpacer: {
    width: 20,
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
    borderRadius: 12,
    backgroundColor: 'rgba(245,197,24,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapArrowText: {
    color: '#f5c518',
    fontSize: 14,
    lineHeight: 18,
  },
  activeGap: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  unknownCard: {
    width: 80,
    height: 100,
    backgroundColor: '#2a1f4a',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#f5c518',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  unknownCardIcon: {
    fontSize: 20,
  },
  unknownCardLabel: {
    color: '#f5c518',
    fontSize: 22,
    fontWeight: '900',
  },
  unknownCardSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  confirmBtn: {
    backgroundColor: '#f5c518',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  confirmBtnText: {
    color: '#0a0a0a',
    fontSize: 12,
    fontWeight: '800',
  },
});
