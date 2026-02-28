import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { C, R, FS } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Challenge, Movie, Player, Turn } from '@/lib/database.types';
import { TrailerPlayer, TrailerPlayerHandle } from '@/components/TrailerPlayer';
import { Timeline } from '@/components/Timeline';
import { ChallengeTimer } from '@/components/ChallengeTimer';
import { CardBack, CardFront } from '@/components/MovieCard';

const REPORT_OPTIONS = [
  { id: 'spoiler',       label: '🎬  Title or info is revealed in the clip' },
  { id: 'unavailable',   label: '📺  Video won\'t load or keeps buffering'  },
  { id: 'ads',           label: '📢  An ad plays instead of the trailer'    },
  { id: 'wrong_trailer', label: '🎭  Wrong trailer for this movie'          },
  { id: 'no_audio',      label: '🔇  No audio or sound is too quiet'        },
  { id: 'poor_quality',  label: '📱  Video quality is too poor to watch'    },
  { id: 'loops',         label: '🔁  Trailer loops before the window ends'  },
  { id: 'other',         label: '❓  Other'                                 },
];

const db = supabase as unknown as { from: (t: string) => any };
const POLL_MS = 2000;

export default function GameScreen() {
  const router = useRouter();
  const {
    game,
    activeMovies,
    playerId: myPlayerId,
    players: storePlayers,
    setPlayers,
    setCurrentTurn,
    setChallenges,
  } = useAppStore();

  const [players, setLocalPlayers] = useState<Player[]>(storePlayers);
  const [currentTurn, setLocalTurn] = useState<Turn | null>(null);
  const [challenges, setLocalChallenges] = useState<Challenge[]>([]);
  const [trailerEnded, setTrailerEnded] = useState(false);
  const [readyToPlace, setReadyToPlace] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hasReplayed, setHasReplayed] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const [showLandscapePrompt, setShowLandscapePrompt] = useState(false);

  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);
  const [hasPassed, setHasPassed] = useState(false);
  const [myChallenge, setMyChallenge] = useState<Challenge | null>(null);
  const [challengeInterval, setChallengeInterval] = useState<number | null>(null);
  const [challengeConfirmed, setChallengeConfirmed] = useState(false);

  const trailerRef = useRef<TrailerPlayerHandle>(null);

  const cardAnimY = useRef(new Animated.Value(0)).current;
  const cardAnimScale = useRef(new Animated.Value(1)).current;
  const cardAnimOpacity = useRef(new Animated.Value(1)).current;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so the interval always has the latest values
  const currentTurnRef = useRef<Turn | null>(null);
  const gameIdRef = useRef<string | null>(null);

  // Portrait during intro/loading, landscape for the actual game
  useEffect(() => {
    if (loading || showIntro) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  }, [loading, showIntro]);

  useEffect(() => {
    if (!game) { router.replace('/'); return; }
    gameIdRef.current = game.id;
    loadState();
    return () => stopPolling();
  }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(poll, POLL_MS);
  }

  async function poll() {
    const gId = gameIdRef.current;
    if (!gId) return;

    // Fetch latest turn
    const { data: latestTurn } = await db
      .from('turns')
      .select('*')
      .eq('game_id', gId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single() as { data: Turn | null };

    if (latestTurn) {
      const prevTurn = currentTurnRef.current;
      const turnChanged = !prevTurn || prevTurn.id !== latestTurn.id;
      const statusChanged = prevTurn?.status !== latestTurn.status;

      if (turnChanged || statusChanged) {
        currentTurnRef.current = latestTurn;
        setLocalTurn(latestTurn);
        setCurrentTurn(latestTurn);

        // Reset per-turn UI state when a new turn starts
        if (turnChanged) {
          setTrailerEnded(false);
          setReadyToPlace(false);
          setUserPaused(false);
          setHasReplayed(false);
          setSelectedInterval(null);
          setHasPassed(false);
          setMyChallenge(null);
          setChallengeInterval(null);
          setChallengeConfirmed(false);
          setLocalChallenges([]);
          setChallenges([]);
          cardAnimY.setValue(0);
          cardAnimScale.setValue(1);
          cardAnimOpacity.setValue(1);
          setShowReportDialog(false);
          setSnackMessage('');
        }
      }

      // Fetch challenges for current turn
      const { data: cData } = await db
        .from('challenges')
        .select('*')
        .eq('turn_id', latestTurn.id) as { data: Challenge[] | null };
      if (cData) {
        setLocalChallenges(cData);
        setChallenges(cData);
        // Sync my own challenge in case it arrived from DB
        const mine = cData.find((c) => c.challenger_id === myPlayerId);
        if (mine) setMyChallenge(mine);
      }
    }

    // Fetch players (timeline updates after reveal)
    const { data: pData } = await db
      .from('players')
      .select('*')
      .eq('game_id', gId)
      .order('created_at') as { data: Player[] | null };
    if (pData) { setLocalPlayers(pData); setPlayers(pData); }
  }

  async function loadState() {
    const g = game;
    if (!g) return;
    setLoading(true);

    const [{ data: pData }, { data: tData }] = await Promise.all([
      db.from('players').select('*').eq('game_id', g.id).order('created_at'),
      db.from('turns').select('*').eq('game_id', g.id)
        .order('created_at', { ascending: false }).limit(1).single(),
    ]) as [{ data: Player[] | null }, { data: Turn | null }];

    const loadedPlayers = pData ?? [];
    const loadedTurn = tData ?? null;

    setLocalPlayers(loadedPlayers);
    setPlayers(loadedPlayers);
    setLocalTurn(loadedTurn);
    setCurrentTurn(loadedTurn);
    currentTurnRef.current = loadedTurn;

    if (loadedTurn) {
      const { data: cData } = await db
        .from('challenges').select('*').eq('turn_id', loadedTurn.id) as { data: Challenge[] | null };
      const loaded = cData ?? [];
      setLocalChallenges(loaded);
      setChallenges(loaded);
    }

    const isGameStart = loadedPlayers.every(p => (p.timeline ?? []).length <= 1);
    setShowIntro(isGameStart);
    setLoading(false);
    startPolling();
  }

  // ── Helpers ──

  function getPlayer(id: string | null) {
    return players.find((p) => p.id === id) ?? null;
  }
  function getActivePlayer() { return getPlayer(currentTurn?.active_player_id ?? null); }
  function isActivePlayer() { return myPlayerId === currentTurn?.active_player_id; }
  function getMovie() { return activeMovies.find((m) => m.id === currentTurn?.movie_id) ?? null; }
  function getActivePlayerTimeline(): number[] { return getActivePlayer()?.timeline ?? []; }

  // Returns the single correct interval for a year in a timeline (no duplicate).
  function computeCorrectInterval(year: number, timeline: number[]): number {
    const sorted = [...timeline].sort((a, b) => a - b);
    let idx = 0;
    while (idx < sorted.length && sorted[idx] < year) idx++;
    return idx;
  }

  // When the placed year already exists in the timeline, BOTH adjacent intervals are valid
  // (before or after the existing card with the same year).
  function computeValidIntervals(year: number, timeline: number[]): number[] {
    const sorted = [...timeline].sort((a, b) => a - b);
    const dupIdx = sorted.indexOf(year);
    if (dupIdx !== -1) {
      return [dupIdx, dupIdx + 1];
    }
    return [computeCorrectInterval(year, timeline)];
  }

  // ── Actions (with optimistic updates so UI responds instantly) ──

  async function handleLetsDraw() {
    if (!currentTurn) return;
    const optimistic = { ...currentTurn, status: 'placing' as const };
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ status: 'placing' }).eq('id', currentTurn.id);
  }

  async function handleConfirmPlacement() {
    if (!currentTurn || selectedInterval === null) return;
    const optimistic = { ...currentTurn, placed_interval: selectedInterval, status: 'challenging' as const };
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ placed_interval: selectedInterval, status: 'challenging' }).eq('id', currentTurn.id);
  }

  async function handleChallenge() {
    if (!currentTurn || myChallenge) return;
    setHasPassed(false);
    const { data: inserted } = await db
      .from('challenges')
      .insert({ turn_id: currentTurn.id, challenger_id: myPlayerId!, interval_index: -1 })
      .select().single() as { data: Challenge | null };
    if (inserted) setMyChallenge(inserted);
  }

  async function handleConfirmChallengeInterval() {
    if (!myChallenge || challengeInterval === null) return;
    await db.from('challenges').update({ interval_index: challengeInterval }).eq('id', myChallenge.id);
    setMyChallenge({ ...myChallenge, interval_index: challengeInterval });
    setChallengeConfirmed(true);
  }

  async function handleAnimatedConfirm() {
    await new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.timing(cardAnimY, { toValue: 260, duration: 380, useNativeDriver: true }),
        Animated.timing(cardAnimScale, { toValue: 0.3, duration: 380, useNativeDriver: true }),
        Animated.timing(cardAnimOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => resolve());
    });
    handleConfirmPlacement();
  }

  async function handleReveal() {
    if (!currentTurn) return;
    const optimistic = { ...currentTurn, status: 'revealing' as const };
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ status: 'revealing' }).eq('id', currentTurn.id);
  }

  async function submitReport(reason: string) {
    setShowReportDialog(false);
    if (!currentTurn) return;
    await db.from('reports').insert({ movie_id: currentTurn.movie_id, reason });
    setSnackMessage("Thanks! 🙏  We'll review this trailer soon.");
  }

  async function handleNextTurn() {
    const g = game;
    if (!g || !currentTurn) return;
    const movie = getMovie();
    if (!movie) return;

    const activeTimeline = getActivePlayerTimeline();
    const validIntervals = computeValidIntervals(movie.year, activeTimeline);
    const activeCorrect =
      currentTurn.placed_interval !== null &&
      currentTurn.placed_interval !== undefined &&
      validIntervals.includes(currentTurn.placed_interval);
    // A challenger wins only if the active player was wrong and they placed in a valid interval
    const winningChallenger = activeCorrect
      ? null
      : challenges.find((c) => c.interval_index !== -1 && validIntervals.includes(c.interval_index));

    let winnerId: string | null = null;
    if (activeCorrect) winnerId = currentTurn.active_player_id;
    else if (winningChallenger) winnerId = winningChallenger.challenger_id;

    if (winnerId) {
      const winner = getPlayer(winnerId);
      if (winner) {
        const newTimeline = [...winner.timeline, movie.year].sort((a, b) => a - b);
        await db.from('players').update({ timeline: newTimeline }).eq('id', winnerId);
      }
    }

    const currentIdx = players.findIndex((p) => p.id === currentTurn.active_player_id);
    const nextPlayer = players[(currentIdx + 1) % players.length];

    const { data: pastTurns } = await db
      .from('turns')
      .select('movie_id')
      .eq('game_id', g.id);
    const usedMovieIds = new Set<string>(pastTurns?.map((t: { movie_id: string }) => t.movie_id) ?? []);
    const pool = activeMovies.filter((m) => !usedMovieIds.has(m.id));
    const nextMovie = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : activeMovies[Math.floor(Math.random() * activeMovies.length)];

    await db.from('turns').insert({
      game_id: g.id,
      active_player_id: nextPlayer.id,
      movie_id: nextMovie.id,
      status: 'drawing',
    });
  }

  // ── Phase renderers ──

  if (loading || !currentTurn) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#f5c518" />
      </SafeAreaView>
    );
  }

  if (showIntro) {
    const myPlayer = players.find(p => p.id === myPlayerId) ?? null;
    const startingYear = myPlayer?.timeline[0];
    const startingMovie = activeMovies.find(m => m.year === startingYear) ?? null;
    return (
      <GameIntroScreen
        startingMovie={startingMovie}
        playerName={myPlayer?.display_name ?? 'Player'}
        onDone={() => { setShowIntro(false); setShowLandscapePrompt(true); }}
        allMovies={activeMovies}
      />
    );
  }

  if (showLandscapePrompt) {
    return <LandscapePromptScreen onDone={() => setShowLandscapePrompt(false)} />;
  }

  const movie = getMovie();
  const activePlayer = getActivePlayer();
  const amActive = isActivePlayer();
  const timeline = getActivePlayerTimeline();
  const placedMovies: Movie[] = players.flatMap((p) =>
    p.timeline
      .map((year) => activeMovies.find((mv) => mv.year === year))
      .filter((m): m is Movie => m !== undefined)
  );

  // ── DRAWING ──
  if (currentTurn.status === 'drawing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.phaseCenter}>
          {amActive ? (
            <>
              <Text style={styles.bigTurnText}>{activePlayer?.display_name}'s turn!</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleLetsDraw}>
                <Text style={styles.primaryBtnText}>Let's Guess 🎬</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeText}>
                  {activePlayer?.display_name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.waitingText}>{activePlayer?.display_name} is thinking…</Text>
              <ActivityIndicator color="#f5c518" style={{ marginTop: 12 }} />
            </>
          )}
        </View>
        <ScoreBar players={players} myId={myPlayerId} />
      </SafeAreaView>
    );
  }

  // ── PLACING ──
  if (currentTurn.status === 'placing') {
    if (!movie) return <LoadingScreen />;

    // ── Timeline (after trailer + ready) ──
    if (readyToPlace) {
      return (
        <SafeAreaView style={styles.container}>
          {/* Top half: floating animated card */}
          <View style={styles.placingTopHalf}>
            <Text style={styles.phaseLabel}>
              {amActive ? 'Where does it go?' : `Waiting for ${activePlayer?.display_name}…`}
            </Text>
            <View style={styles.floatingCardWrapper}>
              <Animated.View
                style={[
                  styles.floatingCard,
                  {
                    transform: [{ translateY: cardAnimY }, { scale: cardAnimScale }],
                    opacity: cardAnimOpacity,
                  },
                ]}
              >
                <CardBack width={CARD_W} height={CARD_H} />
              </Animated.View>
            </View>
          </View>

          {/* Bottom half: timeline */}
          <View style={styles.placingBottomHalf}>
            {amActive && selectedInterval === null && (
              <Text style={styles.tapHint}>Tap ⌄ to pick a spot</Text>
            )}
            <Timeline
              timeline={timeline}
              currentCardMovie={movie}
              interactive={amActive}
              selectedInterval={selectedInterval}
              onIntervalSelect={setSelectedInterval}
              onConfirm={handleAnimatedConfirm}
              placedMovies={placedMovies}
              hideFloatingCard
            />
          </View>

          <ScoreBar players={players} myId={myPlayerId} />
        </SafeAreaView>
      );
    }

    // ── Trailer ended — intermediate screen ──
    if (trailerEnded) {
      if (!amActive) {
        return (
          <View style={styles.endedOverlay}>
            <SafeAreaView style={styles.endedInner} edges={['top', 'bottom']}>
              <View style={styles.endedCenter}>
                <Text style={styles.endedTitle}>🎬</Text>
                <Text style={styles.endedWaiting}>
                  Waiting for {activePlayer?.display_name} to place the card…
                </Text>
              </View>
            </SafeAreaView>
          </View>
        );
      }

      return (
        <View style={styles.endedOverlay}>
          <SafeAreaView style={styles.endedInner} edges={['top', 'bottom']}>
            <View style={styles.endedCenter}>
              <Text style={styles.endedTitle}>Ready to guess? 🎬</Text>
              <Text style={styles.endedSubtitle}>What year is this movie from?</Text>
            </View>
            <View style={styles.endedActions}>
              {!hasReplayed && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.replayButton]}
                  onPress={() => {
                    setHasReplayed(true);
                    setTrailerEnded(false);
                    setUserPaused(false);
                  }}
                >
                  <Text style={styles.replayButtonText}>↺  Replay</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionButton, styles.nextButton]}
                onPress={() => setReadyToPlace(true)}
              >
                <Text style={styles.nextButtonText}>Place it! →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      );
    }

    // ── Trailer playing ──
    return (
      <View style={styles.trailerContainer}>
        <TrailerPlayer
          key={currentTurn.id}
          ref={trailerRef}
          movie={movie}
          onEnded={() => { setTrailerEnded(true); setUserPaused(false); }}
        />

        {/* Touch blocker — prevents YouTube from showing title on tap (all players) */}
        {!userPaused && (
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              if (amActive) { trailerRef.current?.pause(); setUserPaused(true); }
            }}
          />
        )}

        {/* Controls: Report + I know it! — active player only */}
        {amActive && (
          <SafeAreaView style={styles.trailerControls} edges={['top', 'bottom', 'right']} pointerEvents="box-none">
            <View />
            <View style={styles.cornerActions}>
              <TouchableOpacity style={styles.reportButton} onPress={() => setShowReportDialog(true)}>
                <Text style={styles.reportButtonText}>⚑ Report</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => { trailerRef.current?.stop(); setTrailerEnded(true); setUserPaused(false); }}
              >
                <Text style={styles.skipButtonText}>I know it! →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}

        {/* Observer label */}
        {!amActive && (
          <SafeAreaView style={styles.trailerControls} edges={['top']} pointerEvents="none">
            <View style={styles.watchingBadge}>
              <Text style={styles.watchingBadgeText}>👀 {activePlayer?.display_name} is playing</Text>
            </View>
            <View />
          </SafeAreaView>
        )}

        {/* Pause overlay — active player only */}
        {amActive && userPaused && (
          <TouchableOpacity
            style={styles.pauseOverlay}
            activeOpacity={1}
            onPress={() => { setUserPaused(false); trailerRef.current?.resume(); }}
          >
            <Text style={styles.pauseIcon}>▶</Text>
          </TouchableOpacity>
        )}

        {/* Report modal */}
        <Modal visible={showReportDialog} transparent animationType="fade" onRequestClose={() => setShowReportDialog(false)}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowReportDialog(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.reportSheet}>
              <View style={styles.reportHeader}>
                <Text style={styles.reportTitle}>What's wrong?</Text>
                <TouchableOpacity onPress={() => setShowReportDialog(false)} style={styles.reportCloseBtn}>
                  <Text style={styles.reportCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.reportGrid}>
                {REPORT_OPTIONS.map((opt) => (
                  <TouchableOpacity key={opt.id} style={styles.reportOption} onPress={() => submitReport(opt.label)}>
                    <Text style={styles.reportOptionText}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Snackbar
          visible={snackMessage.length > 0}
          onDismiss={() => setSnackMessage('')}
          duration={3500}
          style={styles.snack}
          theme={{ colors: { inverseSurface: '#1e1630', inverseOnSurface: '#fff', inversePrimary: '#f5c518' } }}
        >
          {snackMessage}
        </Snackbar>
      </View>
    );
  }

  // ── CHALLENGING ──
  if (currentTurn.status === 'challenging') {
    const alreadyDecided = hasPassed || myChallenge !== null;

    // Intervals already claimed: active player's pick + any confirmed challenger picks
    const takenSet = new Set<number>();
    if (currentTurn.placed_interval !== null && currentTurn.placed_interval !== undefined) {
      takenSet.add(currentTurn.placed_interval);
    }
    challenges.forEach(c => { if (c.interval_index !== -1) takenSet.add(c.interval_index); });
    const blockedIntervals = Array.from(takenSet);
    const totalIntervals = timeline.length + 1;
    const canChallenge = totalIntervals - takenSet.size > 0;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.challengingLayout}>
          <View style={styles.timelineSection}>
            <Timeline
              timeline={timeline}
              currentCardMovie={movie!}
              interactive={false}
              selectedInterval={null}
              onIntervalSelect={() => {}}
              onConfirm={() => {}}
              placedInterval={currentTurn.placed_interval}
              placedMovies={placedMovies}
            />
          </View>

          {amActive ? (
            <View style={styles.challengePanel}>
              <Text style={styles.challengePanelTitle}>Challenges received</Text>
              {challenges.length === 0 ? (
                <Text style={styles.noChallengesText}>None yet</Text>
              ) : (
                challenges.map((c) => {
                  const name = getPlayer(c.challenger_id)?.display_name ?? '?';
                  return (
                    <Text key={c.id} style={styles.challengeEntry}>
                      {name} → {c.interval_index === -1 ? 'picking…' : `interval ${c.interval_index}`}
                    </Text>
                  );
                })
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleReveal}>
                <Text style={styles.primaryBtnText}>Reveal the Card 🃏</Text>
              </TouchableOpacity>
            </View>
          ) : myChallenge && !challengeConfirmed ? (
            <View style={styles.challengePanel}>
              <Text style={styles.challengePanelTitle}>Where would YOU place it?</Text>
              <Timeline
                timeline={timeline}
                currentCardMovie={movie!}
                interactive
                selectedInterval={challengeInterval}
                onIntervalSelect={setChallengeInterval}
                onConfirm={handleConfirmChallengeInterval}
                placedMovies={placedMovies}
                blockedIntervals={blockedIntervals}
              />
              {challengeInterval === null && (
                <Text style={styles.tapHint}>Tap ⌄ to pick a spot</Text>
              )}
            </View>
          ) : alreadyDecided || challengeConfirmed ? (
            <View style={styles.challengePanel}>
              <Text style={styles.noChallengesText}>
                {challengeConfirmed
                  ? `You challenged — interval ${challengeInterval}`
                  : 'Waiting for others…'}
              </Text>
              {challenges.map((c) => {
                const name = getPlayer(c.challenger_id)?.display_name ?? '?';
                return (
                  <Text key={c.id} style={styles.challengeEntry}>
                    {name} → {c.interval_index === -1 ? 'picking…' : `interval ${c.interval_index}`}
                  </Text>
                );
              })}
            </View>
          ) : (
            <View style={styles.challengePanel}>
              {canChallenge ? (
                <>
                  <Text style={styles.challengePanelTitle}>Challenge?</Text>
                  <View style={styles.challengeTimerRow}>
                    <ChallengeTimer seconds={5} onExpire={() => setHasPassed(true)} />
                  </View>
                  <View style={styles.challengeButtons}>
                    <TouchableOpacity style={styles.challengeBtn} onPress={handleChallenge}>
                      <Text style={styles.challengeBtnText}>Challenge</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.passBtn} onPress={() => setHasPassed(true)}>
                      <Text style={styles.passBtnText}>Pass</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.challengePanelTitle}>No spots left</Text>
                  <Text style={styles.noChallengesText}>All intervals are taken</Text>
                  <TouchableOpacity style={styles.passBtn} onPress={() => setHasPassed(true)}>
                    <Text style={styles.passBtnText}>Got it</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
        <ScoreBar players={players} myId={myPlayerId} />
      </SafeAreaView>
    );
  }

  // ── REVEALING ──
  if (currentTurn.status === 'revealing') {
    const m = movie;
    if (!m) return <LoadingScreen />;

    const validIntervals = computeValidIntervals(m.year, timeline);
    const activeCorrect =
      currentTurn.placed_interval !== null &&
      currentTurn.placed_interval !== undefined &&
      validIntervals.includes(currentTurn.placed_interval);
    // A challenger wins only when the active player was wrong
    const winningChallenger = activeCorrect
      ? null
      : challenges.find((c) => c.interval_index !== -1 && validIntervals.includes(c.interval_index));
    // Coin-back: active was correct AND a challenger also picked the OTHER valid interval
    // (duplicate-year case — both adjacent intervals are valid, challenger wasn't wrong)
    const coinBackChallengers = (validIntervals.length === 2 && activeCorrect)
      ? challenges.filter(
          (c) =>
            c.interval_index !== -1 &&
            validIntervals.includes(c.interval_index) &&
            c.interval_index !== currentTurn.placed_interval
        )
      : [];
    const coinBackNames = coinBackChallengers
      .map((c) => getPlayer(c.challenger_id)?.display_name)
      .filter(Boolean) as string[];

    let resultText = 'Nobody got it — card trashed 🗑️';
    let resultName = '';
    if (activeCorrect) {
      resultName = activePlayer?.display_name ?? '';
      resultText = 'got it right! 🎉';
    } else if (winningChallenger) {
      resultName = getPlayer(winningChallenger.challenger_id)?.display_name ?? '';
      resultText = 'challenged correctly! 🎯';
    }

    const resultEmoji = activeCorrect ? '🎉' : winningChallenger ? '🎯' : '🗑️';

    return (
      <SafeAreaView style={styles.container}>
        {/* Timeline with card flip animation at placed_interval */}
        <View style={styles.revealTimelineWrapper}>
          <Timeline
            timeline={timeline}
            currentCardMovie={m}
            interactive={false}
            selectedInterval={null}
            onIntervalSelect={() => {}}
            onConfirm={() => {}}
            placedInterval={currentTurn.placed_interval}
            placedMovies={placedMovies}
            revealingMovie={m}
          />
        </View>

        {/* Result strip */}
        <View style={styles.revealResultStrip}>
          <Text style={styles.revealResultEmoji}>{resultEmoji}</Text>
          <View style={styles.revealResultTextBlock}>
            <Text style={styles.revealResultText}>
              {resultName
                ? <><Text style={styles.revealResultPlayer}>{resultName}</Text>{' '}{resultText}</>
                : resultText}
            </Text>
            {coinBackNames.length > 0 && (
              <Text style={styles.revealCoinBack}>
                {'🪙 '}
                <Text style={styles.revealCoinBackName}>{coinBackNames.join(', ')}</Text>
                {' also had it right — coin returned'}
              </Text>
            )}
          </View>
        </View>

        {/* Full-width button strip above score bar */}
        <View style={styles.revealFooter}>
          <TouchableOpacity style={styles.revealNextBtn} onPress={handleNextTurn} activeOpacity={0.85}>
            <Text style={styles.revealNextBtnText}>Next Player →</Text>
          </TouchableOpacity>
        </View>

        <ScoreBar players={players} myId={myPlayerId} />
      </SafeAreaView>
    );
  }

  return <LoadingScreen />;
}

function ScoreBar({ players, myId }: { players: Player[]; myId: string | null }) {
  return (
    <ScrollView
      horizontal
      style={styles.scoreBar}
      contentContainerStyle={styles.scoreBarContent}
      showsHorizontalScrollIndicator={false}
    >
      {players.map((p) => (
        <View key={p.id} style={[styles.scoreChip, p.id === myId && styles.scoreChipMe]}>
          <Text style={styles.scoreChipName}>{p.display_name}</Text>
          <Text style={styles.scoreChipCount}>{p.timeline.length}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#f5c518" />
    </SafeAreaView>
  );
}

// ── Game intro: Price Is Right spinning wheel ──

const CARD_W = 72;
const CARD_H = 100;
// Always exactly 12 slots — enough to fill the wheel visually without gaps.
const WHEEL_CARD_COUNT = 12;
const WHEEL_RADIUS = 150;
// HIGHLIGHT_IDX = 4 starts at (4/12)*360 = 120°.
// After WHEEL_TOTAL_SPIN, it lands at 90° (3 o'clock):
//   (120 + WHEEL_TOTAL_SPIN) mod 360 = 90  →  WHEEL_TOTAL_SPIN = 5*360 + 90 - 120 = 1770°
const WHEEL_HIGHLIGHT_IDX = 4;
const WHEEL_TOTAL_SPIN = 5 * 360 + 90 - (WHEEL_HIGHLIGHT_IDX / WHEEL_CARD_COUNT) * 360; // 1770°
// Pre-compute card positions once (static — doesn't depend on allMovies)
const WHEEL_POSITIONS = Array.from({ length: WHEEL_CARD_COUNT }, (_, i) => {
  const rad = (i / WHEEL_CARD_COUNT) * 2 * Math.PI;
  return {
    left: WHEEL_RADIUS + Math.sin(rad) * WHEEL_RADIUS - CARD_W / 2,
    top:  WHEEL_RADIUS - Math.cos(rad) * WHEEL_RADIUS - CARD_H / 2,
  };
});

// ── Landscape orientation prompt ──

function LandscapePromptScreen({ onDone }: { onDone: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[lsStyles.screen, { opacity: fadeAnim }]}>
      <Text style={lsStyles.icon}>📱</Text>
      <Text style={lsStyles.title}>Rotate your device</Text>
      <Text style={lsStyles.subtitle}>The rest of the game is played in landscape mode</Text>
    </Animated.View>
  );
}

const lsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 40,
  },
  icon: { fontSize: 56 },
  title: {
    color: C.textPrimary,
    fontSize: FS.xl,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: C.textMuted,
    fontSize: FS.base,
    textAlign: 'center',
    lineHeight: 20,
  },
});

function GameIntroScreen({
  startingMovie,
  playerName,
  onDone,
  allMovies: _allMovies,
}: {
  startingMovie: Movie | null;
  playerName: string;
  onDone: () => void;
  allMovies: Movie[];
}) {
  const { width: screenWidth } = useWindowDimensions();
  const arrowRight = screenWidth / 2 - WHEEL_RADIUS - CARD_W / 2 - 4;

  // Allow tap-to-advance once the wheel has stopped
  const canDismiss = useRef(false);
  // All cards look identical during the spin; only the highlight reveals after stopping
  const [spinDone, setSpinDone] = useState(false);

  const wheelRotation  = useRef(new Animated.Value(0)).current;
  const otherOpacity   = useRef(new Animated.Value(1)).current;
  const arrowOpacity   = useRef(new Animated.Value(1)).current;
  // After wheel stops: card slides toward screen center (translateX = -WHEEL_RADIUS)
  const highlightX     = useRef(new Animated.Value(0)).current;
  const highlightScale = useRef(new Animated.Value(1)).current;
  const revealOpacity  = useRef(new Animated.Value(0)).current;
  const screenOpacity  = useRef(new Animated.Value(0)).current;

  const wheelRotStr   = wheelRotation.interpolate({
    inputRange:  [0, WHEEL_TOTAL_SPIN],
    outputRange: ['0deg', `${WHEEL_TOTAL_SPIN}deg`],
  });
  const counterRotStr = wheelRotation.interpolate({
    inputRange:  [0, WHEEL_TOTAL_SPIN],
    outputRange: ['0deg', `-${WHEEL_TOTAL_SPIN}deg`],
  });
  const backOpacity = revealOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  useEffect(() => {
    // Phase 1: fade in + wheel spin
    Animated.sequence([
      Animated.timing(screenOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(wheelRotation, {
        toValue: WHEEL_TOTAL_SPIN,
        duration: 3000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(100),
    ]).start(() => {
      canDismiss.current = true;
      setSpinDone(true); // swap SpinCard → CardBack on highlight card

      // Phase 2: arrow + others vanish, highlight card glides to center and flips
      Animated.sequence([
        Animated.parallel([
          Animated.timing(otherOpacity,   { toValue: 0,            duration: 300, useNativeDriver: true }),
          Animated.timing(arrowOpacity,   { toValue: 0,            duration: 200, useNativeDriver: true }),
          // translateX after counter-rotation = moves in screen-space X (toward center)
          Animated.timing(highlightX,     { toValue: -WHEEL_RADIUS, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(highlightScale, { toValue: 1.8,           duration: 520, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }),
        ]),
        Animated.delay(80),
        Animated.timing(revealOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        // Hold so player can read the card, then auto-advance
        Animated.delay(2500),
      ]).start(() => onDone());
    });
  }, []);

  return (
    <Animated.View style={[introStyles.screen, { opacity: screenOpacity }]}>
      {/* Whole screen is tappable — advances once wheel has stopped */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => { if (canDismiss.current) onDone(); }}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={introStyles.inner} edges={['top', 'bottom']}>

          <View style={introStyles.header}>
            <Text style={introStyles.headline}>Your starting card</Text>
            <Text style={introStyles.subtext}>Draw from the deck, {playerName}</Text>
          </View>

          <View style={{ height: WHEEL_RADIUS * 2 + CARD_H, alignSelf: 'stretch' }}>
            {/* Pointer arrow */}
            <Animated.View style={[introStyles.pointerRow, {
              top: CARD_H / 2 + WHEEL_RADIUS - 14,
              right: arrowRight,
              opacity: arrowOpacity,
            }]}>
              <Text style={introStyles.pointer}>◄</Text>
            </Animated.View>

            <Animated.View style={[introStyles.wheelContainer, {
              width: WHEEL_RADIUS * 2,
              height: WHEEL_RADIUS * 2,
              top: CARD_H / 2,
              marginLeft: -WHEEL_RADIUS,
              transform: [{ rotate: wheelRotStr }],
            }]}>
              {WHEEL_POSITIONS.map((pos, i) => {
                const isHighlight = i === WHEEL_HIGHLIGHT_IDX;
                const cardTransform: any[] = isHighlight
                  ? [{ rotate: counterRotStr }, { translateX: highlightX }, { scale: highlightScale }]
                  : [{ rotate: counterRotStr }];

                return (
                  <Animated.View
                    key={i}
                    style={[
                      introStyles.cardWrapper,
                      {
                        left:      pos.left,
                        top:       pos.top,
                        opacity:   isHighlight ? 1 : otherOpacity,
                        zIndex:    isHighlight ? 10 : i,
                        transform: cardTransform,
                      },
                    ]}
                  >
                    <View style={introStyles.card}>
                      {isHighlight && spinDone ? (
                        // Wheel has stopped: reveal CardBack → fade to CardFront
                        <>
                          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity }]}>
                            <CardBack width={CARD_W} height={CARD_H} />
                          </Animated.View>
                          <Animated.View style={[StyleSheet.absoluteFill, { opacity: revealOpacity }]}>
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
                        style={[StyleSheet.absoluteFill, introStyles.cardRing, { opacity: revealOpacity }]}
                        pointerEvents="none"
                      />
                    )}
                  </Animated.View>
                );
              })}
            </Animated.View>
          </View>

          <View style={introStyles.footer}>
            <Animated.Text style={[introStyles.tapHint, { opacity: revealOpacity }]}>
              Tap anywhere to continue
            </Animated.Text>
          </View>

        </SafeAreaView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const introStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: 14,
    gap: 5,
  },
  headline: {
    color: C.textPrimary,
    fontSize: FS.lg,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  subtext: {
    color: C.textMuted,
    fontSize: FS.sm,
    fontWeight: '500',
  },
  // `right` and `top` are set dynamically in JSX (WHEEL_RADIUS is now dynamic)
  pointerRow: {
    position: 'absolute',
    zIndex: 30,
  },
  pointer: {
    color: C.gold,
    fontSize: 26,
  },
  // wheel container; size + margin are set dynamically in JSX
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
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  // Golden ring overlay — fades in with revealOpacity so all cards look the same during spin
  cardRing: {
    borderRadius: R.sm,
    borderWidth: 2.5,
    borderColor: C.gold,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 14,
    minHeight: 40,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FS.sm,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  phaseCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, paddingHorizontal: 40 },
  bigTurnText: { color: C.textPrimary, fontSize: FS['2xl'], fontWeight: '900', textAlign: 'center' },
  waitingText: { color: C.textSub, fontSize: FS.lg, textAlign: 'center' },
  avatarLarge: {
    width: 72, height: 72, borderRadius: R.full,
    backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
  },
  avatarLargeText: { color: C.textOnGold, fontSize: FS.xl, fontWeight: '900' },
  primaryBtn: { backgroundColor: C.gold, borderRadius: R.btn, paddingHorizontal: 32, paddingVertical: 14 },
  primaryBtnText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '900' },
  phaseLabel: { color: C.textSub, fontSize: FS.base, fontWeight: '600', textAlign: 'center' },
  tapHint: { color: C.textMuted, fontSize: FS.sm, textAlign: 'center', marginTop: 4 },

  placingLayout: { flex: 1, justifyContent: 'center', gap: 12, paddingVertical: 12 },
  placingHeader: { alignItems: 'center' },
  placingTopHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderSubtle,
  },
  placingBottomHalf: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  floatingCardWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingCard: {
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  watchingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: R.btn,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 12,
  },
  watchingBadgeText: { color: 'rgba(255,255,255,0.6)', fontSize: FS.sm, fontWeight: '500' },
  endedWaiting: {
    color: C.textSub,
    fontSize: FS.md,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 40,
  },

  challengingLayout: { flex: 1, flexDirection: 'row', gap: 16, padding: 12 },
  timelineSection: { flex: 1, justifyContent: 'center' },
  challengePanel: {
    width: 220, backgroundColor: C.surface, borderRadius: R.card,
    padding: 16, gap: 10, justifyContent: 'center',
  },
  challengePanelTitle: { color: C.textPrimary, fontSize: FS.base + 1, fontWeight: '700' },
  noChallengesText: { color: C.textMuted, fontSize: FS.sm },
  challengeEntry: { color: C.textSub, fontSize: FS.xs },
  challengeTimerRow: { alignItems: 'center', marginVertical: 4 },
  challengeButtons: { gap: 8 },
  challengeBtn: { backgroundColor: C.danger, borderRadius: R.sm, paddingVertical: 10, alignItems: 'center' },
  challengeBtnText: { color: C.textPrimary, fontSize: FS.base, fontWeight: '800' },
  passBtn: { backgroundColor: C.border, borderRadius: R.sm, paddingVertical: 10, alignItems: 'center' },
  passBtnText: { color: C.textMuted, fontSize: FS.base, fontWeight: '600' },

  // ── Revealing phase ──
  revealTimelineWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  revealResultStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  revealResultTextBlock: {
    flex: 1,
    gap: 4,
  },
  revealResultEmoji: { fontSize: 36 },
  revealResultText: { color: C.textPrimary, fontSize: FS.md, fontWeight: '700', lineHeight: 22 },
  revealResultPlayer: { color: C.gold, fontWeight: '900' },
  revealCoinBack: { color: C.textSub, fontSize: FS.sm, lineHeight: 17 },
  revealCoinBackName: { color: C.gold, fontWeight: '700' },
  revealFooter: { paddingHorizontal: 24, paddingBottom: 10 },
  revealNextBtn: {
    backgroundColor: C.gold,
    borderRadius: R.btn,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: C.gold,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  revealNextBtnText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '900', letterSpacing: 0.4 },

  // ── Trailer overlay ──
  trailerContainer: { flex: 1, backgroundColor: '#000' },
  trailerControls: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'flex-end', justifyContent: 'space-between', padding: 16,
  },
  cornerActions: { alignItems: 'flex-end', gap: 10 },
  reportButton: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: R.btn, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reportButtonText: { color: C.textSub, fontSize: FS.sm, fontWeight: '500' },
  skipButton: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: R.card, backgroundColor: C.gold,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3,
    shadowRadius: 6, elevation: 6,
  },
  skipButtonText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '800', letterSpacing: 0.4 },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  pauseIcon: { color: '#fff', fontSize: 72, opacity: 0.9 },

  // ── Ended screen ──
  endedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 20 },
  endedInner: { flex: 1, justifyContent: 'space-between', padding: 20 },
  endedCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  endedTitle: { color: C.textPrimary, fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  endedSubtitle: {
    color: C.gold, fontSize: FS.sm, textAlign: 'center',
    fontWeight: '600', letterSpacing: 2.5, textTransform: 'uppercase',
  },
  endedActions: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingBottom: 16 },
  actionButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: R.card },
  replayButton: {
    backgroundColor: C.border, borderWidth: 1,
    borderColor: C.borderSubtle,
  },
  replayButtonText: { color: C.textPrimary, fontSize: FS.md, fontWeight: '700', letterSpacing: 0.3 },
  nextButton: { backgroundColor: C.gold },
  nextButtonText: { color: C.textOnGold, fontSize: FS.md + 1, fontWeight: '800', letterSpacing: 0.3 },

  // ── Report modal ──
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  reportSheet: { backgroundColor: C.surface, borderRadius: R.card, overflow: 'hidden', width: '100%', maxWidth: 640 },
  reportHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  reportTitle: { color: C.textPrimary, fontSize: FS.md, fontWeight: '700' },
  reportCloseBtn: { padding: 4 },
  reportCloseText: { color: C.textMuted, fontSize: FS.md },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  reportOption: {
    width: '50%', paddingVertical: 13, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderSubtle,
  },
  reportOptionText: { color: C.textSub, fontSize: FS.sm, lineHeight: 18 },
  snack: { backgroundColor: C.surface, marginBottom: 16 },

  scoreBar: { flexGrow: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  scoreBarContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', alignItems: 'center' },
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  scoreChipMe: { borderWidth: 1, borderColor: C.gold },
  scoreChipName: { color: C.textSub, fontSize: FS.sm, fontWeight: '600' },
  scoreChipCount: { color: C.gold, fontSize: FS.sm, fontWeight: '800' },
});
