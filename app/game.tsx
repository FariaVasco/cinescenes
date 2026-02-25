import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Snackbar } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Challenge, Movie, Player, Turn } from '@/lib/database.types';
import { TrailerPlayer, TrailerPlayerHandle } from '@/components/TrailerPlayer';
import { Timeline } from '@/components/Timeline';
import { ChallengeTimer } from '@/components/ChallengeTimer';

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

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

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

  function computeCorrectInterval(year: number, timeline: number[]): number {
    const sorted = [...timeline].sort((a, b) => a - b);
    let idx = 0;
    while (idx < sorted.length && sorted[idx] < year) idx++;
    return idx;
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
    const correctInterval = computeCorrectInterval(movie.year, activeTimeline);
    const activeCorrect = currentTurn.placed_interval === correctInterval;
    const correctChallenger = challenges.find(
      (c) => c.interval_index === correctInterval && c.interval_index !== -1
    );

    let winnerId: string | null = null;
    if (activeCorrect) winnerId = currentTurn.active_player_id;
    else if (correctChallenger) winnerId = correctChallenger.challenger_id;

    if (winnerId) {
      const winner = getPlayer(winnerId);
      if (winner) {
        const newTimeline = [...winner.timeline, movie.year].sort((a, b) => a - b);
        await db.from('players').update({ timeline: newTimeline }).eq('id', winnerId);
      }
    }

    const currentIdx = players.findIndex((p) => p.id === currentTurn.active_player_id);
    const nextPlayer = players[(currentIdx + 1) % players.length];

    const usedMovieIds = new Set<string>();
    players.forEach((p) => p.timeline.forEach((year) => {
      const m = activeMovies.find((mv) => mv.year === year);
      if (m) usedMovieIds.add(m.id);
    }));
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
        onDone={() => setShowIntro(false)}
      />
    );
  }

  const movie = getMovie();
  const activePlayer = getActivePlayer();
  const amActive = isActivePlayer();
  const timeline = getActivePlayerTimeline();
  const placedMovies = players.flatMap((p) =>
    p.timeline.map((year) => {
      const m = activeMovies.find((mv) => mv.year === year);
      return { year, title: m?.title ?? '' };
    })
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
                <Text style={styles.floatingCardIcon}>🎬</Text>
                <Text style={styles.floatingCardQ}>?</Text>
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

    const correctInterval = computeCorrectInterval(m.year, timeline);
    const activeCorrect = currentTurn.placed_interval === correctInterval;
    const correctChallenger = challenges.find(
      (c) => c.interval_index === correctInterval && c.interval_index !== -1
    );
    let resultText = 'Nobody got it — card trashed 🗑️';
    let resultName = '';
    if (activeCorrect) {
      resultName = activePlayer?.display_name ?? '';
      resultText = 'got it right! 🎉';
    } else if (correctChallenger) {
      resultName = getPlayer(correctChallenger.challenger_id)?.display_name ?? '';
      resultText = 'challenged correctly! 🎯';
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.revealLayout}>
          <View style={styles.revealCard}>
            <Text style={styles.revealYear}>{m.year}</Text>
            <Text style={styles.revealTitle}>{m.title}</Text>
            <Text style={styles.revealDirector}>{m.director}</Text>
          </View>
          <View style={styles.revealInfo}>
            <Text style={styles.revealInfoLabel}>Correct position: interval {correctInterval}</Text>
            <Text style={styles.revealInfoLabel}>Placed at: interval {currentTurn.placed_interval}</Text>
          </View>
          <View style={styles.resultBanner}>
            {resultName ? (
              <Text style={styles.resultText}>
                <Text style={styles.resultName}>{resultName}</Text> {resultText}
              </Text>
            ) : (
              <Text style={styles.resultText}>{resultText}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleNextTurn}>
            <Text style={styles.primaryBtnText}>Next Player →</Text>
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

// ── Game intro: starting card reveal ──

const NUM_INTRO_CARDS = 5;
const HIGHLIGHT_IDX = 2; // center card is the player's
const FAN_CONFIGS = [
  { angle: -22, x: -105, y: 18 },
  { angle: -11, x: -52,  y: 6  },
  { angle: 0,   x: 0,    y: 0  },
  { angle: 11,  x: 52,   y: 6  },
  { angle: 22,  x: 105,  y: 18 },
];
// Render order: non-highlight first so highlight card is on top in DOM order
const RENDER_ORDER = [0, 1, 3, 4, HIGHLIGHT_IDX];

function GameIntroScreen({
  startingMovie,
  playerName,
  onDone,
}: {
  startingMovie: Movie | null;
  playerName: string;
  onDone: () => void;
}) {
  const cardAnims = useRef(
    Array.from({ length: NUM_INTRO_CARDS }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rotate: new Animated.Value(0),
      scale: new Animated.Value(1),
    }))
  ).current;

  const revealOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(0)).current;

  const backOpacity = revealOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  useEffect(() => {
    const fadeIn = Animated.timing(screenOpacity, { toValue: 1, duration: 350, useNativeDriver: true });

    const fanOut = Animated.parallel(
      cardAnims.map((anim, i) =>
        Animated.parallel([
          Animated.spring(anim.x, { toValue: FAN_CONFIGS[i].x, useNativeDriver: true, tension: 55, friction: 9 }),
          Animated.spring(anim.y, { toValue: FAN_CONFIGS[i].y, useNativeDriver: true, tension: 55, friction: 9 }),
          Animated.spring(anim.rotate, { toValue: FAN_CONFIGS[i].angle, useNativeDriver: true, tension: 55, friction: 9 }),
        ])
      )
    );

    const liftCard = Animated.parallel([
      Animated.spring(cardAnims[HIGHLIGHT_IDX].y,      { toValue: -72, useNativeDriver: true, tension: 65, friction: 7 }),
      Animated.spring(cardAnims[HIGHLIGHT_IDX].scale,  { toValue: 1.38, useNativeDriver: true, tension: 65, friction: 7 }),
      Animated.spring(cardAnims[HIGHLIGHT_IDX].rotate, { toValue: 0, useNativeDriver: true, tension: 65, friction: 7 }),
    ]);

    const revealFace = Animated.timing(revealOpacity, { toValue: 1, duration: 480, useNativeDriver: true });
    const showBtn   = Animated.timing(buttonOpacity,  { toValue: 1, duration: 350, useNativeDriver: true });

    Animated.sequence([
      fadeIn,
      Animated.delay(150),
      fanOut,
      Animated.delay(550),
      liftCard,
      Animated.delay(180),
      revealFace,
      Animated.delay(280),
      showBtn,
    ]).start();
  }, []);

  return (
    <Animated.View style={[introStyles.screen, { opacity: screenOpacity }]}>
      <SafeAreaView style={introStyles.inner} edges={['top', 'bottom']}>

        <View style={introStyles.header}>
          <Text style={introStyles.headline}>Your starting card</Text>
          <Text style={introStyles.subtext}>Draw from the deck, {playerName}</Text>
        </View>

        <View style={introStyles.cardArea}>
          {RENDER_ORDER.map((i) => {
            const anim = cardAnims[i];
            const isHighlight = i === HIGHLIGHT_IDX;
            const rotate = anim.rotate.interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] });

            return (
              <Animated.View
                key={i}
                style={[
                  StyleSheet.absoluteFill,
                  introStyles.cardWrapper,
                  { zIndex: isHighlight ? 10 : i },
                  { transform: [{ translateX: anim.x }, { translateY: anim.y }, { rotate }, { scale: anim.scale }] },
                ]}
              >
                <View style={[introStyles.card, isHighlight && introStyles.cardHighlight]}>
                  {isHighlight ? (
                    <>
                      <Animated.View style={[StyleSheet.absoluteFill, introStyles.cardSide, { opacity: backOpacity }]}>
                        <Text style={introStyles.cardBackIcon}>🎬</Text>
                        <Text style={introStyles.cardBackQ}>?</Text>
                      </Animated.View>
                      <Animated.View style={[StyleSheet.absoluteFill, introStyles.cardSide, { opacity: revealOpacity }]}>
                        <Text style={introStyles.revealYear}>{startingMovie?.year ?? '????'}</Text>
                        <Text style={introStyles.revealTitle} numberOfLines={3}>{startingMovie?.title ?? '—'}</Text>
                        <Text style={introStyles.revealDirector} numberOfLines={1}>{startingMovie?.director ?? ''}</Text>
                      </Animated.View>
                    </>
                  ) : (
                    <View style={introStyles.cardSide}>
                      <Text style={introStyles.cardBackIcon}>🎬</Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>

        <Animated.View style={[introStyles.footer, { opacity: buttonOpacity }]}>
          <TouchableOpacity style={introStyles.doneButton} onPress={onDone} activeOpacity={0.85}>
            <Text style={introStyles.doneButtonText}>Got it!  →</Text>
          </TouchableOpacity>
        </Animated.View>

      </SafeAreaView>
    </Animated.View>
  );
}

const introStyles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#100a20',
    zIndex: 100,
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
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  subtext: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  cardArea: {
    height: 190,
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  cardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 90,
    height: 125,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2a2040',
    backgroundColor: '#1a1430',
  },
  cardHighlight: {
    borderColor: '#f5c518',
    shadowColor: '#f5c518',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  cardSide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: '#2a1f4a',
  },
  cardBackIcon: { fontSize: 22 },
  cardBackQ: { color: '#f5c518', fontSize: 22, fontWeight: '900' },
  revealYear: { color: '#f5c518', fontSize: 21, fontWeight: '900' },
  revealTitle: {
    color: '#fff',
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 13,
    fontWeight: '600',
  },
  revealDirector: { color: '#888', fontSize: 8, textAlign: 'center' },
  footer: {
    alignItems: 'center',
    paddingBottom: 14,
  },
  doneButton: {
    backgroundColor: '#f5c518',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 52,
    shadowColor: '#f5c518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  doneButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#100a20' },
  phaseCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, paddingHorizontal: 40 },
  bigTurnText: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  waitingText: { color: '#aaa', fontSize: 18, textAlign: 'center' },
  avatarLarge: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#f5c518', alignItems: 'center', justifyContent: 'center',
  },
  avatarLargeText: { color: '#0a0a0a', fontSize: 24, fontWeight: '900' },
  primaryBtn: { backgroundColor: '#f5c518', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  primaryBtnText: { color: '#0a0a0a', fontSize: 16, fontWeight: '900' },
  phaseLabel: { color: '#aaa', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  tapHint: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 4 },

  placingLayout: { flex: 1, justifyContent: 'center', gap: 12, paddingVertical: 12 },
  placingHeader: { alignItems: 'center' },
  placingTopHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    width: 90,
    height: 120,
    backgroundColor: '#2a1f4a',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#f5c518',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#f5c518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingCardIcon: { fontSize: 24 },
  floatingCardQ: { color: '#f5c518', fontSize: 28, fontWeight: '900' },
  watchingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 12,
  },
  watchingBadgeText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500' },
  endedWaiting: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 40,
  },

  challengingLayout: { flex: 1, flexDirection: 'row', gap: 16, padding: 12 },
  timelineSection: { flex: 1, justifyContent: 'center' },
  challengePanel: {
    width: 220, backgroundColor: '#1e1630', borderRadius: 16,
    padding: 16, gap: 10, justifyContent: 'center',
  },
  challengePanelTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  noChallengesText: { color: '#666', fontSize: 13 },
  challengeEntry: { color: '#ccc', fontSize: 12 },
  challengeTimerRow: { alignItems: 'center', marginVertical: 4 },
  challengeButtons: { gap: 8 },
  challengeBtn: { backgroundColor: '#e63946', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  challengeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  passBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  passBtnText: { color: '#666', fontSize: 14, fontWeight: '600' },

  revealLayout: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 40 },
  revealCard: {
    backgroundColor: '#1e1630', borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 6, borderWidth: 2, borderColor: '#f5c518', minWidth: 180,
  },
  revealYear: { color: '#f5c518', fontSize: 36, fontWeight: '900' },
  revealTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  revealDirector: { color: '#888', fontSize: 12 },
  revealInfo: { gap: 4, alignItems: 'center' },
  revealInfoLabel: { color: '#666', fontSize: 12 },
  resultBanner: {
    backgroundColor: 'rgba(245,197,24,0.12)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
  },
  resultText: { color: '#fff', fontSize: 16, textAlign: 'center' },
  resultName: { color: '#f5c518', fontWeight: '800' },

  // ── Trailer overlay ──
  trailerContainer: { flex: 1, backgroundColor: '#000' },
  trailerControls: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'flex-end', justifyContent: 'space-between', padding: 16,
  },
  cornerActions: { alignItems: 'flex-end', gap: 10 },
  reportButton: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reportButtonText: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  skipButton: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22, backgroundColor: '#f5c518',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3,
    shadowRadius: 6, elevation: 6,
  },
  skipButtonText: { color: '#0a0a0a', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  pauseIcon: { color: '#fff', fontSize: 72, opacity: 0.9 },

  // ── Ended screen ──
  endedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 20 },
  endedInner: { flex: 1, justifyContent: 'space-between', padding: 20 },
  endedCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  endedTitle: { color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  endedSubtitle: {
    color: '#f5c518', fontSize: 13, textAlign: 'center',
    fontWeight: '600', letterSpacing: 2.5, textTransform: 'uppercase',
  },
  endedActions: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingBottom: 16 },
  actionButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 22 },
  replayButton: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  replayButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  nextButton: { backgroundColor: '#f5c518' },
  nextButtonText: { color: '#0a0a0a', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },

  // ── Report modal ──
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  reportSheet: { backgroundColor: '#1a1a2e', borderRadius: 18, overflow: 'hidden', width: '100%', maxWidth: 640 },
  reportHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  reportTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  reportCloseBtn: { padding: 4 },
  reportCloseText: { color: '#666', fontSize: 16 },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  reportOption: {
    width: '50%', paddingVertical: 13, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  reportOptionText: { color: '#d0d0d0', fontSize: 13, lineHeight: 18 },
  snack: { backgroundColor: '#1e1630', marginBottom: 16 },

  scoreBar: { flexGrow: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  scoreBarContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', alignItems: 'center' },
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1e1630', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  scoreChipMe: { borderWidth: 1, borderColor: '#f5c518' },
  scoreChipName: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  scoreChipCount: { color: '#f5c518', fontSize: 12, fontWeight: '800' },
});
