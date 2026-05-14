import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CardBack, CardFront } from '@/components/MovieCard';
import { C, FS, Fonts, R } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { Movie, Player } from '@/lib/database.types';

const CARD_W = 58;
const CARD_H = 80;
const WHEEL_CARD_COUNT = 12;
const WHEEL_RADIUS = 115;
const WHEEL_HIGHLIGHT_IDX = 4;
const WHEEL_TOTAL_SPIN = 7 * 360 + 90 - (WHEEL_HIGHLIGHT_IDX / WHEEL_CARD_COUNT) * 360;
const WHEEL_POSITIONS = Array.from({ length: WHEEL_CARD_COUNT }, (_, i) => {
  const rad = (i / WHEEL_CARD_COUNT) * 2 * Math.PI;
  return {
    left: WHEEL_RADIUS + Math.sin(rad) * WHEEL_RADIUS - CARD_W / 2,
    top:  WHEEL_RADIUS - Math.cos(rad) * WHEEL_RADIUS - CARD_H / 2,
  };
});

export function GameIntroScreen({
  startingMovie,
  playerName,
  onDone,
  allMovies: _allMovies,
  players,
  amHost,
  allPlayersReady,
  onSpinComplete,
}: {
  startingMovie: Movie | null;
  playerName: string;
  onDone: () => void;
  allMovies: Movie[];
  players: Player[];
  amHost: boolean;
  allPlayersReady: boolean;
  onSpinComplete: () => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const arrowRight = screenWidth / 2 - WHEEL_RADIUS - CARD_W / 2 - 4;

  const [started, setStarted] = useState(false);
  const canDismiss = useRef(false);
  const [spinDone, setSpinDone] = useState(false);
  const [readyToStart, setReadyToStart] = useState(false);

  const wheelRotation  = useRef(new Animated.Value(0)).current;
  const otherOpacity   = useRef(new Animated.Value(1)).current;
  const arrowOpacity   = useRef(new Animated.Value(1)).current;
  const highlightX     = useRef(new Animated.Value(0)).current;
  const highlightY     = useRef(new Animated.Value(0)).current;
  const highlightScale = useRef(new Animated.Value(1)).current;
  const flipAnim       = useRef(new Animated.Value(0)).current;
  const tapHintOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity  = useRef(new Animated.Value(0)).current;
  const contextOpacity = useRef(new Animated.Value(1)).current;
  const headerOpacity  = useRef(new Animated.Value(1)).current;
  const exitOpacity    = useRef(new Animated.Value(1)).current;
  const exitingRef     = useRef(false);
  // Parchment curtain that fades out on mount — BrandedLoader has parchment bg
  // and GameIntroScreen has ink bg; this curtain bridges the two so the swap is
  // perceived as the parchment darkening, not a hard color cut.
  const parchmentCurtain = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.timing(parchmentCurtain, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function fadeOutAndDone() {
    if (exitingRef.current) return;
    exitingRef.current = true;
    Animated.timing(exitOpacity, {
      toValue: 0,
      duration: 420,
      useNativeDriver: true,
    }).start(() => onDone());
  }

  const wheelRotStr   = wheelRotation.interpolate({
    inputRange:  [0, WHEEL_TOTAL_SPIN],
    outputRange: ['0deg', `${WHEEL_TOTAL_SPIN}deg`],
    extrapolate: 'clamp',
  });
  const counterRotStr = wheelRotation.interpolate({
    inputRange:  [0, WHEEL_TOTAL_SPIN],
    outputRange: ['0deg', `-${WHEEL_TOTAL_SPIN}deg`],
    extrapolate: 'clamp',
  });

  const backRotY   = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg',   '90deg',  '90deg'] });
  const frontRotY  = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg']  });
  const backFace   = flipAnim.interpolate({ inputRange: [0, 0.499, 0.5], outputRange: [1, 1, 0] });
  const frontFace  = flipAnim.interpolate({ inputRange: [0, 0.5, 0.501], outputRange: [0, 0, 1] });

  useEffect(() => {
    if (!started) return;

    Animated.sequence([
      Animated.timing(contextOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(screenOpacity,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(wheelRotation, {
        toValue: WHEEL_TOTAL_SPIN,
        duration: 5500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(600),
    ]).start(() => {
      setSpinDone(true);
      haptics.impact();

      Animated.sequence([
        Animated.parallel([
          Animated.timing(otherOpacity,   { toValue: 0,             duration: 350, useNativeDriver: true }),
          Animated.timing(arrowOpacity,   { toValue: 0,             duration: 250, useNativeDriver: true }),
          Animated.timing(headerOpacity,  { toValue: 0,             duration: 300, useNativeDriver: true }),
          Animated.timing(highlightX,     { toValue: -WHEEL_RADIUS, duration: 700, easing: Easing.out(Easing.cubic),      useNativeDriver: true }),
          Animated.timing(highlightY,     { toValue: -70,           duration: 700, easing: Easing.out(Easing.cubic),      useNativeDriver: true }),
          Animated.timing(highlightScale, { toValue: 1.8,           duration: 700, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }),
        ]),
        Animated.delay(150),
        Animated.timing(flipAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(100),
        Animated.timing(tapHintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        canDismiss.current = true;
        setReadyToStart(true);
        onSpinComplete();
      });
    });
  }, [started]);

  return (
    <Animated.View style={[styles.screen, { opacity: exitOpacity }]}>

      {/* ── Context screen (shown first, fades out on "Let's spin!") ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: contextOpacity }]}
        pointerEvents={started ? 'none' : 'auto'}
      >
        <SafeAreaView style={styles.contextInner} edges={['top', 'bottom']}>
          <View style={styles.contextBody}>
            <Text style={styles.contextTitle}>Time to spin </Text>
            <Text style={styles.contextDesc}>
              {playerName}, we'll randomly draw a movie to kick off your timeline.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.spinBtn}
            onPress={() => setStarted(true)}
            activeOpacity={0.75}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image source={require('../assets/lc-spinning-wheel.png')} style={{ width: 40, height: 40 }} />
              <Text style={styles.spinBtnText}>Let's spin! </Text>
            </View>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </SafeAreaView>
      </Animated.View>

      {/* ── Wheel screen (fades in after "Let's spin!") ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: screenOpacity }]}
        pointerEvents={started ? 'auto' : 'none'}
      >
        <View style={{ flex: 1 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { justifyContent: 'center', alignItems: 'center', opacity: headerOpacity },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.headline}>Your starting card</Text>
              <Text style={styles.subtext}>Draw from the deck, {playerName}</Text>
            </View>
          </Animated.View>

          <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={{ height: WHEEL_RADIUS * 2 + CARD_H, alignSelf: 'stretch' }}>
              <Animated.View style={[styles.pointerRow, {
                top: CARD_H / 2 + WHEEL_RADIUS - 14,
                right: arrowRight,
                opacity: arrowOpacity,
              }]}>
                <Text style={styles.pointer}>◄</Text>
              </Animated.View>

              <Animated.View style={[styles.wheelContainer, {
                width: WHEEL_RADIUS * 2,
                height: WHEEL_RADIUS * 2,
                top: CARD_H / 2,
                marginLeft: -WHEEL_RADIUS,
                transform: [{ rotate: wheelRotStr }],
              }]}>
                {WHEEL_POSITIONS.map((pos, i) => {
                  const isHighlight = i === WHEEL_HIGHLIGHT_IDX;
                  const cardTransform: any[] = isHighlight
                    ? [{ rotate: counterRotStr }, { translateX: highlightX }, { translateY: highlightY }, { scale: highlightScale }]
                    : [{ rotate: counterRotStr }];

                  return (
                    <Animated.View
                      key={i}
                      style={[
                        styles.cardWrapper,
                        {
                          left:      pos.left,
                          top:       pos.top,
                          opacity:   isHighlight ? 1 : otherOpacity,
                          zIndex:    isHighlight ? 10 : i,
                          transform: cardTransform,
                        },
                      ]}
                    >
                      <View style={styles.card}>
                        {isHighlight && spinDone ? (
                          <>
                            <Animated.View style={[StyleSheet.absoluteFill, {
                              opacity: backFace,
                              transform: [{ perspective: 600 }, { rotateY: backRotY }],
                            }]}>
                              <CardBack width={CARD_W} height={CARD_H} />
                            </Animated.View>
                            <Animated.View style={[StyleSheet.absoluteFill, {
                              opacity: frontFace,
                              transform: [{ perspective: 600 }, { rotateY: frontRotY }],
                            }]}>
                              {startingMovie
                                ? <CardFront movie={startingMovie} width={CARD_W} height={CARD_H} />
                                : <CardBack width={CARD_W} height={CARD_H} />}
                            </Animated.View>
                          </>
                        ) : (
                          <CardBack width={CARD_W} height={CARD_H} />
                        )}
                      </View>
                      {isHighlight && (
                        <Animated.View
                          style={[StyleSheet.absoluteFill, styles.cardRing, { opacity: frontFace }]}
                          pointerEvents="none"
                        />
                      )}
                    </Animated.View>
                  );
                })}
              </Animated.View>
            </View>
          </View>

          <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            <Animated.View style={[styles.footer, { opacity: tapHintOpacity }]}>
              {players.length > 1 && (
                <View style={styles.playerList}>
                  {players.map(p => (
                    <View key={p.id} style={styles.playerRow}>
                      <Text style={styles.playerRowName}>{p.display_name}</Text>
                      <Text style={[styles.playerRowStatus, p.last_seen ? styles.playerReady : styles.playerWaiting]}>
                        {p.last_seen ? 'Ready ✓' : 'Spinning…'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {amHost ? (
                <TouchableOpacity
                  style={[styles.startBtn, !allPlayersReady && styles.startBtnDisabled]}
                  onPress={allPlayersReady ? fadeOutAndDone : undefined}
                  activeOpacity={allPlayersReady ? 0.8 : 1}
                >
                  {allPlayersReady ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.startBtnText}>Let's start playing! </Text>
                      <Image source={require('../assets/lc-clapperboard.png')} style={{ width: 18, height: 18 }} />
                    </View>
                  ) : (
                    <Text style={[styles.startBtnText, { color: 'rgba(0,0,0,0.35)' }]}>
                      Waiting for everyone…
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <Text style={styles.waitingHostText}>Waiting for host to start…</Text>
              )}
            </Animated.View>
          </SafeAreaView>
        </View>
      </Animated.View>

      {/* Parchment curtain — covers the ink bg on mount, fades out over ~520ms
          so the handoff from BrandedLoader (parchment) reads as a soft darken. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg, opacity: parchmentCurtain }]}
      />

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.inkBg,
  },
  inner: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: 5,
  },
  headline: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    letterSpacing: 0.3,
  },
  subtext: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.sm,
  },
  pointerRow: {
    position: 'absolute',
    zIndex: 30,
  },
  pointer: {
    color: C.gold,
    fontSize: 40,
  },
  wheelContainer: {
    position: 'absolute',
    left: '50%',
  },
  cardWrapper: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: R.sm,
    overflow: 'hidden',
  },
  cardRing: {
    borderRadius: R.sm,
    borderWidth: 2.5,
    borderColor: C.gold,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 18,
    gap: 14,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  miniTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  miniGap: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(245,197,24,0.3)',
    borderRadius: 1,
  },
  addedLabel: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.sm,
  },
  startBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  startBtnText: {
    color: C.textOnOchre,
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    letterSpacing: 0.4,
  },
  startBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'transparent',
  },
  playerList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    maxWidth: '100%',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: R.full,
  },
  playerRowName: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.body,
    fontSize: FS.xs,
  },
  playerRowStatus: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
  },
  playerReady: {
    color: '#4CAF50',
  },
  playerWaiting: {
    color: 'rgba(255,255,255,0.35)',
  },
  waitingHostText: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    textAlign: 'center',
  },
  contextInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 32,
  },
  contextBody: {
    alignItems: 'center',
    gap: 12,
  },
  contextTitle: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  contextDesc: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  spinBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: 36,
    paddingVertical: 16,
  },
  spinBtnText: {
    color: C.textOnOchre,
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    letterSpacing: 0.5,
  },
});
