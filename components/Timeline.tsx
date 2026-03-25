import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
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
  /** When set, the revealingMovie card is held back for this many ms then springs in. */
  insertDelay?: number;
  /** When set, the revealingMovie card flies off the screen after this many ms (trash result). */
  trashAfter?: number;
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
  insertDelay,
  trashAfter,
}, ref) {
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const activeGapRef = useRef<View>(null);

  // Card insertion animation — used when insertDelay is set
  const [insertVisible, setInsertVisible] = useState(false);
  const [insertOverlay, setInsertOverlay] = useState<{ x: number; y: number } | null>(null);
  const insertScale = useRef(new Animated.Value(0.85)).current;
  const insertOpacity = useRef(new Animated.Value(0)).current;
  const insertTranslateY = useRef(new Animated.Value(-600)).current;
  const insertSlotWidth = useRef(new Animated.Value(0)).current;
  const insertSlotMargin = useRef(new Animated.Value(0)).current;
  const insertSlotRef = useRef<View>(null);

  useEffect(() => {
    if (!insertDelay || !revealingMovie) {
      setInsertVisible(false);
      setInsertOverlay(null);
      insertScale.setValue(0.85);
      insertOpacity.setValue(0);
      insertTranslateY.setValue(-600);
      insertSlotWidth.setValue(0);
      insertSlotMargin.setValue(0);
      return;
    }
    // Slot 0 (before all cards) or last slot (after all cards) — open space already exists,
    // no need to push the timeline apart. Pre-set to full size immediately.
    const isExtreme = placedInterval === 0 || placedInterval === timeline.length;
    setInsertVisible(false);
    setInsertOverlay(null);
    insertScale.setValue(0.85);
    insertOpacity.setValue(0);
    insertTranslateY.setValue(-600);
    if (isExtreme) {
      insertSlotWidth.setValue(80);
      insertSlotMargin.setValue(24);
    } else {
      insertSlotWidth.setValue(0);
      insertSlotMargin.setValue(0);
    }
    const t = setTimeout(() => {
      const runAnim = () => {
        // Card entry speed mirrors the trash fly-off: 700ms Easing.out(cubic) (decelerate into slot)
        // Slot expansion (non-extreme only) mirrors the trash slot collapse: 600ms Easing.inOut(quad)
        const anims: Animated.CompositeAnimation[] = [
          Animated.timing(insertTranslateY, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(insertScale,      { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(insertOpacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
        ];
        if (!isExtreme) {
          anims.push(Animated.timing(insertSlotWidth,  { toValue: 80, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }));
          anims.push(Animated.timing(insertSlotMargin, { toValue: 24, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }));
        }
        Animated.parallel(anims).start(() => {
          setInsertVisible(true);
          setInsertOverlay(null);
        });
      };
      // Measure slot + wrapper so the overlay card starts off-screen above and lands in the slot
      if (insertSlotRef.current && wrapperRef.current) {
        let slotPos: { pageX: number; pageY: number } | null = null;
        let wrapPos: { pageX: number; pageY: number } | null = null;
        const tryStart = () => {
          if (!slotPos || !wrapPos) return;
          // +24: account for the marginHorizontal applied when the slot is at full size
          setInsertOverlay({ x: slotPos.pageX - wrapPos.pageX + 24, y: slotPos.pageY - wrapPos.pageY });
          insertTranslateY.setValue(-(slotPos.pageY + 100));
          runAnim();
        };
        insertSlotRef.current.measure((_x, _y, _w, _h, pageX, pageY) => { slotPos = { pageX, pageY }; tryStart(); });
        wrapperRef.current.measure((_x, _y, _w, _h, pageX, pageY) => { wrapPos = { pageX, pageY }; tryStart(); });
      } else {
        setInsertVisible(true);
      }
    }, insertDelay);
    return () => clearTimeout(t);
  }, [!!insertDelay, revealingMovie?.id]);

  // Trash-out animation — fires trashAfter ms after the result is shown
  const [trashGone, setTrashGone] = useState(false);
  const [trashOverlay, setTrashOverlay] = useState<{ x: number; y: number } | null>(null);
  const trashAnim = useRef(new Animated.Value(0)).current;
  const collapseAnim = useRef(new Animated.Value(0)).current;
  const wrapperRef = useRef<View>(null);
  const trashCardRef = useRef<View>(null);

  // Pre-computed interpolations (stable references, reused in slot + overlay)
  const trashTx  = trashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });
  const trashTy  = trashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -180] });
  const trashRot = trashAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '50deg'] });
  const trashOp  = trashAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0.9, 0] });
  const trashCollapseWidth  = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const trashCollapseMargin = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  useEffect(() => {
    if (!trashAfter || !revealingMovie) {
      setTrashGone(false);
      setTrashOverlay(null);
      trashAnim.setValue(0);
      collapseAnim.setValue(0);
      return;
    }
    setTrashGone(false);
    setTrashOverlay(null);
    trashAnim.setValue(0);
    collapseAnim.setValue(0);
    const t = setTimeout(() => {
      const runAnim = () => {
        Animated.timing(trashAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          Animated.timing(collapseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }).start(() => { setTrashGone(true); setTrashOverlay(null); });
        });
      };
      // Measure card + wrapper to position the overlay outside the ScrollView
      if (trashCardRef.current && wrapperRef.current) {
        let cardPos: { pageX: number; pageY: number } | null = null;
        let wrapperPos: { pageX: number; pageY: number } | null = null;
        const tryStart = () => {
          if (!cardPos || !wrapperPos) return;
          setTrashOverlay({ x: cardPos.pageX - wrapperPos!.pageX, y: cardPos.pageY - wrapperPos!.pageY });
          runAnim();
        };
        trashCardRef.current.measure((_x, _y, _w, _h, pageX, pageY) => { cardPos = { pageX, pageY }; tryStart(); });
        wrapperRef.current.measure((_x, _y, _w, _h, pageX, pageY) => { wrapperPos = { pageX, pageY }; tryStart(); });
      } else {
        runAnim();
      }
    }, trashAfter);
    return () => clearTimeout(t);
  }, [!!trashAfter, revealingMovie?.id]);

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
        if (insertDelay) {
          // Challenger insertion: slot opens + card flies in from above (via overlay)
          if (insertVisible) {
            // Animation complete — card rests in slot at full size
            return (
              <View key={`gap-${index}`} style={{ marginHorizontal: 24 }}>
                <CardFront movie={revealingMovie} width={80} height={100} />
              </View>
            );
          }
          if (insertOverlay) {
            // Slot is expanding to receive the card (card itself is in the overlay)
            return (
              <Animated.View
                key={`gap-${index}`}
                style={{ width: insertSlotWidth, marginHorizontal: insertSlotMargin }}
              />
            );
          }
          // Before animation: collapsed invisible slot (used for position measurement)
          return <View key={`gap-${index}`} ref={insertSlotRef} style={{ width: 0, height: 100 }} />;
        }
        if (trashAfter) {
          // Trash: card flies up-right (via absolute overlay), then slot collapses
          if (trashGone) {
            return <View key={`gap-${index}`} style={styles.gapSpacer} />;
          }
          return (
            <Animated.View
              key={`gap-${index}`}
              style={{ width: trashCollapseWidth, marginHorizontal: trashCollapseMargin }}
            >
              {/* Card only shown here until the overlay takes over */}
              {!trashOverlay && (
                <View ref={trashCardRef}>
                  <CardFront movie={revealingMovie} width={80} height={100} />
                </View>
              )}
            </Animated.View>
          );
        }
        // Default (active player's flip phase): FlippingMovieCard with autoFlip
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
        <View key={`gap-${index}`} style={styles.coinWrap} onStartShouldSetResponder={() => true}>
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
    <View ref={wrapperRef}>
      <ScrollView
        ref={scrollRef}
        horizontal
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsHorizontalScrollIndicator={false}
      >
        {items}
      </ScrollView>
      {/* Insert overlay — card flies in from above without being clipped by the ScrollView */}
      {insertOverlay && !insertVisible && revealingMovie && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: insertOverlay.x,
            top: insertOverlay.y,
            opacity: insertOpacity,
            transform: [{ translateY: insertTranslateY }, { scale: insertScale }],
          }}
        >
          <CardFront movie={revealingMovie} width={80} height={100} />
        </Animated.View>
      )}
      {/* Trash overlay — rendered outside the ScrollView so it isn't clipped */}
      {trashOverlay && !trashGone && revealingMovie && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: trashOverlay.x,
            top: trashOverlay.y,
            opacity: trashOp,
            transform: [{ translateX: trashTx }, { translateY: trashTy }, { rotate: trashRot }],
          }}
        >
          <CardFront movie={revealingMovie} width={80} height={100} />
        </Animated.View>
      )}
    </View>
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
  insertGap: {
    width: 80,
    height: 100,
    marginHorizontal: 24,
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
