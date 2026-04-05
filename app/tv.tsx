import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Animated, Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { computeValidIntervals, computeSeqChallengeState } from '@/lib/game-logic';
import { Challenge, Movie, Player, Turn } from '@/lib/database.types';
import { TrailerPlayer } from '@/components/TrailerPlayer';
import { FlippingMovieCard } from '@/components/MovieCard';
import { CloseIcon } from '@/components/CinemaIcons';

const db = supabase as unknown as { from: (t: string) => any };

// ── Helper ───────────────────────────────────────────────────────────────────

function intervalToYearText(idx: number, timeline: number[]): string {
  const sorted = [...timeline].sort((a, b) => a - b);
  if (!sorted.length) return 'first card ever';
  if (idx === 0) return `before ${sorted[0]}`;
  if (idx >= sorted.length) return `after ${sorted[sorted.length - 1]}`;
  return `between ${sorted[idx - 1]} and ${sorted[idx]}`;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TVScreen() {
  const { id: gameId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [turn, setTurn] = useState<Turn | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [gameFinished, setGameFinished] = useState(false);
  const [revealPhase, setRevealPhase] = useState<'suspense' | 'flip' | 'result'>('suspense');

  const turnRef = useRef<Turn | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const movieCacheRef = useRef<Map<string, Movie>>(new Map());

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function fetchTurnMovie(movieId: string) {
    if (movieCacheRef.current.has(movieId)) {
      setMovie(movieCacheRef.current.get(movieId)!);
      return;
    }
    const { data } = await db.from('movies').select('*').eq('id', movieId).single();
    if (data) { movieCacheRef.current.set(movieId, data as Movie); setMovie(data as Movie); }
    else setMovie(null);
  }

  async function poll() {
    if (!gameId) return;
    try {
      const [{ data: gameData }, { data: turnRows }, { data: playersData }] = await Promise.all([
        db.from('games').select('status').eq('id', gameId).single(),
        db.from('turns').select('*').eq('game_id', gameId).order('created_at', { ascending: false }).limit(1),
        db.from('players').select('*').eq('game_id', gameId).order('created_at'),
      ]);

      if (playersData) setPlayers(playersData as Player[]);

      if (gameData?.status === 'finished' || gameData?.status === 'cancelled') {
        setGameFinished(true);
        stopPolling();
        return;
      }

      const newTurn = (turnRows?.[0] ?? null) as Turn | null;
      if (!newTurn) return;

      const turnChanged = newTurn.id !== turnRef.current?.id;
      turnRef.current = newTurn;
      if (turnChanged) setChallenges([]);
      setTurn(newTurn);

      if (newTurn.movie_id) {
        if (!movieCacheRef.current.has(newTurn.movie_id)) fetchTurnMovie(newTurn.movie_id);
        else setMovie(movieCacheRef.current.get(newTurn.movie_id)!);
      }

      if (newTurn.status === 'challenging' || newTurn.status === 'revealing') {
        const { data: cData } = await db.from('challenges').select('*').eq('turn_id', newTurn.id);
        if (cData) setChallenges(cData as Challenge[]);
      }
    } catch (_) {}
  }

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { stopPolling(); ScreenOrientation.unlockAsync(); };
  }, []);

  // Reveal phase timing — fires when status becomes 'revealing' or turn id changes
  useEffect(() => {
    if (turn?.status !== 'revealing') return;
    setRevealPhase('suspense');
    const t1 = setTimeout(() => setRevealPhase('flip'), 2400);
    const t2 = setTimeout(() => setRevealPhase('result'), 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [turn?.status, turn?.id]);

  function handleExit() {
    stopPolling();
    ScreenOrientation.unlockAsync();
    router.back();
  }

  // ── Loading ──
  if (!turn || !players.length) {
    return (
      <View style={styles.container}>
        <TvExitButton onPress={handleExit} />
        <ActivityIndicator color={C.ochre} size="large" />
      </View>
    );
  }

  // ── Game over ──
  if (gameFinished) {
    return <TVGameOver players={players} onExit={handleExit} />;
  }

  const activePlayer = players.find(p => p.id === turn.active_player_id);
  const observers = players.filter(p => p.id !== turn.active_player_id);
  const activePlayerTL = activePlayer?.timeline ?? [];

  // ── Drawing ──
  if (turn.status === 'drawing') {
    return (
      <View style={styles.container}>
        <TvExitButton onPress={handleExit} />
        <View style={styles.centeredPhase}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{activePlayer?.display_name.charAt(0).toUpperCase() ?? '?'}</Text>
          </View>
          <Text style={styles.phaseName}>{(activePlayer?.display_name ?? '?').toUpperCase()}'S TURN</Text>
          <Text style={styles.phaseHint}>Get ready to guess!</Text>
        </View>
        <TVScoreBar players={players} activeTurnPlayerId={turn.active_player_id} />
      </View>
    );
  }

  // ── Placing — trailer ──
  if (turn.status === 'placing' && turn.placed_interval === null) {
    return (
      <View style={styles.container}>
        <TvExitButton onPress={handleExit} />
        {movie
          ? <TrailerPlayer movie={movie} />
          : (
            <View style={styles.centeredPhase}>
              <ActivityIndicator color={C.ochre} size="large" />
              <Text style={styles.phaseHint}>Loading trailer…</Text>
            </View>
          )
        }
        <View style={styles.trailerLabel} pointerEvents="none">
          <Text style={styles.trailerLabelText}>🎬  What movie is this?</Text>
        </View>
      </View>
    );
  }

  // ── Placing — making their pick ──
  if (turn.status === 'placing') {
    return (
      <View style={styles.container}>
        <TvExitButton onPress={handleExit} />
        <View style={styles.centeredPhase}>
          <ActivityIndicator color={C.ochre} size="large" />
          <Text style={styles.phaseName}>{activePlayer?.display_name ?? '?'}</Text>
          <Text style={styles.phaseHint}>is making their pick…</Text>
        </View>
        <TVScoreBar players={players} activeTurnPlayerId={turn.active_player_id} />
      </View>
    );
  }

  // ── Challenging ──
  if (turn.status === 'challenging') {
    const { inSeqPhase, seqChallengers } = computeSeqChallengeState(challenges, null, observers);
    const passers = challenges.filter(c => c.interval_index === -2);

    if (inSeqPhase) {
      return (
        <View style={styles.container}>
          <TvExitButton onPress={handleExit} />
          <View style={styles.challengeWrap}>
            <Text style={styles.challengeTitle}>CHALLENGERS</Text>
            <View style={styles.challengeRows}>
              {seqChallengers.map((c) => {
                const p = players.find(pl => pl.id === c.challenger_id);
                const hasPicked = c.interval_index >= 0;
                const isPicking = c.interval_index === -1;
                return (
                  <View key={c.id} style={styles.challengeRow}>
                    <Text style={styles.challengeName}>{p?.display_name ?? '?'}</Text>
                    <Text style={[styles.challengeValue, isPicking && styles.challengeValuePicking]}>
                      {hasPicked ? intervalToYearText(c.interval_index, activePlayerTL) : 'choosing right now…'}
                    </Text>
                  </View>
                );
              })}
              {passers.map((c) => {
                const p = players.find(pl => pl.id === c.challenger_id);
                return (
                  <View key={c.id} style={[styles.challengeRow, styles.challengeRowDimmed]}>
                    <Text style={[styles.challengeName, styles.challengeNameDimmed]}>{p?.display_name ?? '?'}</Text>
                    <Text style={[styles.challengeValue, styles.challengeValueDimmed]}>Passed</Text>
                  </View>
                );
              })}
            </View>
          </View>
          <TVScoreBar players={players} activeTurnPlayerId={turn.active_player_id} />
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <TvExitButton onPress={handleExit} />
        <View style={styles.challengeWrap}>
          <Text style={styles.challengeTitle}>CHALLENGE PHASE</Text>
          {turn.placed_interval !== null && (
            <Text style={styles.challengePlacementHint}>
              {activePlayer?.display_name ?? '?'} placed  ·  {intervalToYearText(turn.placed_interval, activePlayerTL)}
            </Text>
          )}
          <View style={styles.challengeRows}>
            {observers.map((p) => {
              const decided = challenges.some(c => c.challenger_id === p.id);
              return (
                <View key={p.id} style={styles.challengeRow}>
                  <Text style={styles.challengeName}>{p.display_name}</Text>
                  <Text style={[styles.challengeValue, !decided && styles.challengeValuePending]}>
                    {decided ? '✓  Decided' : '…  Deciding'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
        <TVScoreBar players={players} activeTurnPlayerId={turn.active_player_id} />
      </View>
    );
  }

  // ── Revealing ──
  if (turn.status === 'revealing') {
    const validIntervals = movie ? computeValidIntervals(movie.year, activePlayerTL) : [];
    const activeCorrect = turn.placed_interval !== null && validIntervals.includes(turn.placed_interval);
    const challengersSorted = [...challenges]
      .filter(c => c.interval_index >= 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const winningChallenger = activeCorrect
      ? null
      : challengersSorted.find(c => validIntervals.includes(c.interval_index)) ?? null;
    const winnerPlayer = winningChallenger
      ? players.find(p => p.id === winningChallenger.challenger_id)
      : activeCorrect ? activePlayer : null;

    const resultEmoji = winningChallenger ? '⚡' : activeCorrect ? '🎯' : '🗑️';
    const resultText = winningChallenger
      ? `${winnerPlayer?.display_name ?? '?'} wins the challenge!`
      : activeCorrect
      ? `${activePlayer?.display_name ?? '?'} got it!`
      : 'No one got it right';

    const suspenseChallengers = challenges.filter(c => c.interval_index !== -2 && c.interval_index !== -3);

    return (
      <View style={styles.container}>
        <TvExitButton onPress={handleExit} />
        {revealPhase === 'suspense' && (
          <TvSuspenseOverlay challengers={suspenseChallengers} players={players} />
        )}
        {(revealPhase === 'flip' || revealPhase === 'result') && movie && (
          <View style={styles.revealCenter}>
            <FlippingMovieCard movie={movie} width={160} height={220} autoFlip />
            <TvRevealLabel movie={movie} />
          </View>
        )}
        {revealPhase === 'result' && <TvResultBanner emoji={resultEmoji} text={resultText} />}
        {revealPhase === 'result' && winnerPlayer && <ConfettiBurst />}
        <TVScoreBar players={players} activeTurnPlayerId={turn.active_player_id} />
      </View>
    );
  }

  // Fallback (complete / between turns)
  return (
    <View style={styles.container}>
      <TvExitButton onPress={handleExit} />
      <ActivityIndicator color={C.ochre} size="large" style={{ flex: 1 }} />
      <TVScoreBar players={players} activeTurnPlayerId={turn.active_player_id} />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TvExitButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.exitBtn} onPress={onPress}>
      <CloseIcon size={18} color='#fff' />
    </TouchableOpacity>
  );
}

function TVScoreBar({ players, activeTurnPlayerId }: { players: Player[]; activeTurnPlayerId: string }) {
  return (
    <View style={styles.scoreBar}>
      {players.map((p) => {
        const isActive = p.id === activeTurnPlayerId;
        return (
          <View key={p.id} style={[styles.scoreChip, isActive && styles.scoreChipActive]}>
            <Text style={[styles.scoreChipName, isActive && styles.scoreChipNameActive]} numberOfLines={1}>
              {p.display_name}
            </Text>
            <Text style={[styles.scoreChipCount, isActive && styles.scoreChipCountActive]}>
              {p.timeline.length}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function TVGameOver({ players, onExit }: { players: Player[]; onExit: () => void }) {
  const sorted = [...players].sort((a, b) => b.timeline.length - a.timeline.length);
  const winner = sorted[0];
  return (
    <View style={styles.container}>
      <TvExitButton onPress={onExit} />
      <View style={styles.gameOverWrap}>
        <View style={styles.gameOverLeft}>
          <Text style={styles.gameOverEmoji}>🏆</Text>
          <Text style={styles.gameOverWinnerName}>{winner?.display_name ?? '?'}</Text>
          <Text style={styles.gameOverWinnerCards}>{winner?.timeline.length ?? 0} cards collected</Text>
        </View>
        <View style={styles.gameOverRight}>
          {sorted.map((p, i) => (
            <View key={p.id} style={styles.gameOverRow}>
              <Text style={styles.gameOverRank}>{i + 1}</Text>
              <Text style={styles.gameOverName} numberOfLines={1}>{p.display_name}</Text>
              <Text style={styles.gameOverCards}>{p.timeline.length}</Text>
            </View>
          ))}
        </View>
      </View>
      {winner && <ConfettiBurst />}
    </View>
  );
}

// ── Suspense overlay ──────────────────────────────────────────────────────────

const MAX_TV_SUSPENSE = 8;

function TvSuspenseOverlay({ challengers, players }: { challengers: Challenge[]; players: Player[] }) {
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const countScale = useRef(new Animated.Value(0.82)).current;
  const nameAnims = useRef(
    Array.from({ length: MAX_TV_SUSPENSE }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.timing(bgOpacity, { toValue: 0.93, duration: 220, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(countAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(countScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 80 }),
      ]),
    ]).start();
    challengers.slice(0, MAX_TV_SUSPENSE).forEach((_, i) => {
      Animated.sequence([
        Animated.delay(380 + i * 200),
        Animated.timing(nameAnims[i], { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    });
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(countAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 1900);
    return () => clearTimeout(t);
  }, []);

  const count = challengers.length;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#07041a', opacity: bgOpacity }]} />
      <Animated.View style={[styles.suspenseContent, { opacity: countAnim }]}>
        <Animated.Text style={[styles.suspenseCount, { transform: [{ scale: countScale }] }]}>
          {count === 0 ? 'No challengers' : count === 1 ? '1 challenger' : `${count} challengers`}
        </Animated.Text>
        <Text style={styles.suspenseSubLabel}>
          {count === 0 ? '— revealing now' : "— let's see who's right"}
        </Text>
        {challengers.slice(0, MAX_TV_SUSPENSE).map((c, i) => {
          const p = players.find(pl => pl.id === c.challenger_id);
          return (
            <Animated.Text key={c.id} style={[styles.suspenseName, { opacity: nameAnims[i] }]}>
              {p?.display_name ?? '?'}
            </Animated.Text>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ── Reveal label (fades in at 900ms) ─────────────────────────────────────────

function TvRevealLabel({ movie }: { movie: Movie }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 900);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={[styles.revealLabel, { opacity }]}>
      <Text style={styles.revealLabelTitle}>{movie.title}</Text>
      <Text style={styles.revealLabelYear}>{movie.year}</Text>
      {movie.director ? <Text style={styles.revealLabelDirector}>{movie.director}</Text> : null}
    </Animated.View>
  );
}

// ── Result banner (slides up from bottom) ────────────────────────────────────

function TvResultBanner({ emoji, text }: { emoji: string; text: string }) {
  const translateY = useRef(new Animated.Value(80)).current;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, []);
  return (
    <Animated.View style={[styles.resultBanner, { transform: [{ translateY }] }]}>
      <Text style={styles.resultBannerEmoji}>{emoji}</Text>
      <Text style={styles.resultBannerText}>{text}</Text>
    </Animated.View>
  );
}

// ── Confetti burst ────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  '#f5c518', '#f5c518', '#f5c518',
  '#ffffff', '#ffffff',
  '#ffd700', '#ffe082', '#fff3a0',
  '#e63946', '#a855f7', '#22d3ee', '#fb923c',
];
const PER_CANNON = 38;

function ConfettiBurst() {
  const flash1Anim = useRef(new Animated.Value(0)).current;
  const flash2Anim = useRef(new Animated.Value(0)).current;

  const makeParticle = (i: number, wave: number) => {
    const fromRight = i >= PER_CANNON;
    const frac = (i % PER_CANNON) / (PER_CANNON - 1);
    const spreadRad = (130 / 180) * Math.PI;
    const baseAngle = fromRight
      ? (115 / 180) * Math.PI + frac * spreadRad
      : (-60 / 180) * Math.PI + frac * spreadRad;
    const angle = baseAngle + (Math.random() - 0.5) * 0.22;
    const speed = 120 + Math.random() * 220;
    const isStrip = Math.random() < 0.55;
    const gravity = 270 + Math.random() * 160;
    return {
      anim: new Animated.Value(0),
      fromRight,
      dx: Math.cos(angle) * speed,
      dyMid: Math.sin(angle) * speed,
      dyEnd: Math.sin(angle) * speed + gravity,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: isStrip ? 2.5 + Math.random() * 2.5 : 5 + Math.random() * 5,
      h: isStrip ? 11 + Math.random() * 10 : 5 + Math.random() * 5,
      spins: (Math.random() - 0.5) * 9,
      delay: wave === 0 ? Math.floor(Math.random() * 110) : 500 + Math.floor(Math.random() * 160),
    };
  };

  const particles = useRef([
    ...Array.from({ length: PER_CANNON * 2 }, (_, i) => makeParticle(i, 0)),
    ...Array.from({ length: PER_CANNON * 2 }, (_, i) => makeParticle(i, 1)),
  ]).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(flash1Anim, { toValue: 0.18, duration: 90, useNativeDriver: true }),
      Animated.timing(flash1Anim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(flash2Anim, { toValue: 0.12, duration: 90, useNativeDriver: true }),
        Animated.timing(flash2Anim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 500);
    Animated.stagger(
      8,
      particles.map(p =>
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(p.anim, {
            toValue: 1,
            duration: 1100 + Math.random() * 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ])
      )
    ).start();
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#f5c518', opacity: flash1Anim }]} />
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#f5c518', opacity: flash2Anim }]} />
      {particles.map((p, i) => {
        const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const ty = p.anim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, p.dyMid, p.dyEnd] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.5, 0.88, 1], outputRange: [1, 1, 0.6, 0] });
        const rotate = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spins * 360}deg`] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: '9%',
              left: p.fromRight ? '82%' : '18%',
              width: p.w,
              height: p.h,
              borderRadius: 1,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX: tx }, { translateY: ty }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SCORE_BAR_H = 52;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Exit button ──
  exitBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 100,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtnText: {
    color: '#fff',
    fontFamily: Fonts.label,
    fontSize: FS.md,
  },

  // ── Centered phase (drawing / waiting) ──
  centeredPhase: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: SCORE_BAR_H,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.goldFaint,
    borderWidth: 2,
    borderColor: C.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.ochre,
    fontFamily: Fonts.display,
    fontSize: 48,
  },
  phaseName: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  phaseHint: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.md,
    letterSpacing: 1,
  },

  // ── Trailer label ──
  trailerLabel: {
    position: 'absolute',
    bottom: SCORE_BAR_H + 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  trailerLabelText: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: R.full,
    overflow: 'hidden',
  },

  // ── Score bar ──
  scoreBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCORE_BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: R.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  scoreChipActive: {
    borderColor: C.ochre,
    backgroundColor: C.goldFaint,
  },
  scoreChipName: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    maxWidth: 90,
  },
  scoreChipNameActive: {
    color: C.ochre,
  },
  scoreChipCount: {
    color: C.textSubDark,
    fontFamily: Fonts.display,
    fontSize: FS.md,
  },
  scoreChipCountActive: {
    color: C.ochre,
  },

  // ── Challenge phase ──
  challengeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 60,
    paddingBottom: SCORE_BAR_H,
  },
  challengeTitle: {
    color: C.ochre,
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    letterSpacing: 2.5,
  },
  challengePlacementHint: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    letterSpacing: 0.5,
    marginTop: -8,
  },
  challengeRows: {
    width: '100%',
    maxWidth: 520,
    gap: 8,
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: C.inkSurface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  challengeRowDimmed: {
    opacity: 0.38,
  },
  challengeName: {
    flex: 1,
    color: C.textPrimaryDark,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.base,
  },
  challengeNameDimmed: {
    color: C.textSubDark,
  },
  challengeValue: {
    color: C.ochre,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  challengeValuePicking: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
  },
  challengeValuePending: {
    color: C.textMutedDark,
  },
  challengeValueDimmed: {
    color: C.textSubDark,
  },

  // ── Reveal phase ──
  revealCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingBottom: SCORE_BAR_H,
  },
  revealLabel: {
    alignItems: 'center',
    gap: 4,
  },
  revealLabelTitle: {
    color: '#fff',
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    textAlign: 'center',
  },
  revealLabelYear: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    letterSpacing: 2,
  },
  revealLabelDirector: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    fontStyle: 'italic',
  },
  resultBanner: {
    position: 'absolute',
    bottom: SCORE_BAR_H + 16,
    left: 32,
    right: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: C.inkSurface,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ochre,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  resultBannerEmoji: {
    fontSize: 40,
  },
  resultBannerText: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    flex: 1,
  },

  // ── Suspense overlay ──
  suspenseContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  suspenseCount: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: 40,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  suspenseSubLabel: {
    color: C.ochre,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.9,
  },
  suspenseName: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.xl,
    textAlign: 'center',
    opacity: 0.85,
  },

  // ── Game over ──
  gameOverWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 56,
    paddingHorizontal: 40,
  },
  gameOverLeft: {
    alignItems: 'center',
    gap: 10,
  },
  gameOverEmoji: {
    fontSize: 72,
  },
  gameOverWinnerName: {
    color: C.ochre,
    fontFamily: Fonts.display,
    fontSize: FS.hero,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  gameOverWinnerCards: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.base,
  },
  gameOverRight: {
    width: 280,
    gap: 6,
  },
  gameOverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inkSurface,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  gameOverRank: {
    color: C.textMutedDark,
    fontFamily: Fonts.display,
    fontSize: FS.md,
    width: 24,
  },
  gameOverName: {
    flex: 1,
    color: C.textPrimaryDark,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.base,
  },
  gameOverCards: {
    color: C.ochre,
    fontFamily: Fonts.display,
    fontSize: FS.md,
  },
});
