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
  TextInput,
} from 'react-native';
import { SpeechModule, speechAvailable, useSpeechRecognitionEvent } from '@/lib/speech-recognition';
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

async function interpretVoiceInput(transcript: string): Promise<{ movie: string; director: string } | null> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You extract movie titles and director names from game player voice input. Respond only with valid JSON, no prose.',
          },
          {
            role: 'user',
            content: `A player said: "${transcript}"\n\nThey are trying to name a movie and its director. Extract both. Return ONLY: {"movie":"...","director":"..."}\nIf you cannot confidently identify both from what was said, return: {"error":"cannot identify"}`,
          },
        ],
        max_tokens: 80,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const match = content.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.error || !parsed.movie || !parsed.director) return null;
    return { movie: parsed.movie, director: parsed.director };
  } catch {
    return null;
  }
}

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
  const [trailerKey, setTrailerKey] = useState(0);
  const [showMyTimeline, setShowMyTimeline] = useState(false);

  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);
  const [hasPassed, setHasPassed] = useState(false);
  const [myChallenge, setMyChallenge] = useState<Challenge | null>(null);
  const [challengeInterval, setChallengeInterval] = useState<number | null>(null);
  const [challengeConfirmed, setChallengeConfirmed] = useState(false);

  const trailerRef = useRef<TrailerPlayerHandle>(null);

  const cardAnimY = useRef(new Animated.Value(0)).current;
  const cardAnimScale = useRef(new Animated.Value(1)).current;
  const cardAnimOpacity = useRef(new Animated.Value(1)).current;
  const challengeWindowStart = useRef<number | null>(null);
  const revealTriggered = useRef(false);
  const nextTurnInProgress = useRef(false);
  const [revealPhase, setRevealPhase] = useState<'flip' | 'result'>('flip');
  const [movieGuess, setMovieGuess] = useState('');
  const [directorGuess, setDirectorGuess] = useState('');
  const [revealLocked, setRevealLocked] = useState(true);
  const introShownRef = useRef(false);

  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState('');
  const voiceStateRef = useRef<'idle' | 'listening' | 'processing' | 'error'>('idle');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so the interval always has the latest values
  const currentTurnRef = useRef<Turn | null>(null);
  const gameIdRef = useRef<string | null>(null);

  // Portrait during intro/loading/guess input; landscape for the actual game
  useEffect(() => {
    const amActivePlayer = myPlayerId === currentTurn?.active_player_id;
    if (loading || showIntro) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else if (trailerEnded && !readyToPlace && amActivePlayer) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  }, [loading, showIntro, trailerEnded, readyToPlace, myPlayerId, currentTurn?.active_player_id]);

  useEffect(() => {
    if (!game) { router.replace('/'); return; }
    gameIdRef.current = game.id;
    loadState();
    return () => stopPolling();
  }, []);

  // Switch from 'flip' → 'result' after the FlippingMovieCard animation completes
  useEffect(() => {
    if (currentTurn?.status !== 'revealing') return;
    setRevealPhase('flip');
    const t = setTimeout(() => setRevealPhase('result'), 1200);
    return () => clearTimeout(t);
  }, [currentTurn?.status]);

  // Lock the Reveal button for 5.5 s after challenging starts
  // (gives everyone the challenge window + buffer before reveal is allowed)
  useEffect(() => {
    if (currentTurn?.status !== 'challenging') { setRevealLocked(true); return; }
    setRevealLocked(true);
    const t = setTimeout(() => setRevealLocked(false), 5500);
    return () => clearTimeout(t);
  }, [currentTurn?.id, currentTurn?.status]);

  // Pause polling while the active player is typing on the guess screen.
  // Without this, the 2-second poll triggers state updates → KeyboardAvoidingView
  // recalculates layout (causing visible glitching) and disrupts speech recognition.
  useEffect(() => {
    const amActive = myPlayerId === currentTurn?.active_player_id;
    if (trailerEnded && !readyToPlace && amActive) {
      stopPolling();
    } else if (!loading) {
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailerEnded, readyToPlace, myPlayerId, currentTurn?.active_player_id, loading]);

  // Speech recognition event handlers (must be called at component level)
  useSpeechRecognitionEvent('result', async (event) => {
    const transcript = (event.results as any)[0]?.[0]?.transcript ?? '';
    if (!transcript || voiceStateRef.current !== 'listening') return;
    voiceStateRef.current = 'processing';
    setVoiceState('processing');
    const parsed = await interpretVoiceInput(transcript);
    if (parsed) {
      setMovieGuess(parsed.movie);
      setDirectorGuess(parsed.director);
      voiceStateRef.current = 'idle';
      setVoiceState('idle');
    } else {
      voiceStateRef.current = 'error';
      setVoiceError(`Heard: "${transcript}" — couldn't identify movie + director. Please type.`);
      setVoiceState('error');
    }
  });

  useSpeechRecognitionEvent('error', () => {
    if (voiceStateRef.current === 'idle') return;
    voiceStateRef.current = 'error';
    setVoiceError('Speech recognition failed. Please type instead.');
    setVoiceState('error');
  });

  useSpeechRecognitionEvent('end', () => {
    if (voiceStateRef.current === 'listening') {
      voiceStateRef.current = 'error';
      setVoiceError("Didn't catch that. Please try again or type.");
      setVoiceState('error');
    }
  });

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
      const placedIntervalChanged = prevTurn?.placed_interval !== latestTurn.placed_interval;

      if (turnChanged || statusChanged || placedIntervalChanged) {
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
          challengeWindowStart.current = null;
          revealTriggered.current = false;
          nextTurnInProgress.current = false;
          setRevealPhase('flip');
          setMovieGuess('');
          setDirectorGuess('');
          setRevealLocked(true);
          voiceStateRef.current = 'idle';
          setVoiceState('idle');
          setVoiceError('');
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


      // Auto-reveal: active player's device triggers once the challenge window settles
      if (
        latestTurn?.status === 'challenging' &&
        myPlayerId === latestTurn.active_player_id &&
        !revealTriggered.current
      ) {
        const allSettled = (cData ?? []).every((c: Challenge) => c.interval_index !== -1);
        // Initialize window if not set (e.g. fresh load into an already-challenging turn)
        if (challengeWindowStart.current === null) {
          // If challenges are already settled, backdate so the next check fires quickly
          challengeWindowStart.current = allSettled ? Date.now() - 14000 : Date.now();
        }
        const elapsed = Date.now() - challengeWindowStart.current;
        // Reveal after 6.5 s (5 s window + 1.5 s buffer) once everyone has confirmed
        // Hard cutoff at 15 s in case a challenger's app froze
        if (elapsed > 6500 && (allSettled || elapsed > 15000)) {
          revealTriggered.current = true;
          handleReveal();
        }
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
    if (isGameStart && !introShownRef.current) {
      setShowIntro(true);
    }
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
    // Challenging always costs 1 coin
    const challenger = players.find(p => p.id === myPlayerId);
    if (challenger && challenger.coins > 0) {
      await db.from('players').update({ coins: challenger.coins - 1 }).eq('id', myPlayerId);
    }
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
    challengeWindowStart.current = Date.now();
    revealTriggered.current = false;
    handleConfirmPlacement();
  }

  async function handleReveal() {
    if (!currentTurn) return;
    // Award coin to active player if placement correct AND they named the movie + director
    if (myPlayerId === currentTurn.active_player_id && movieGuess.trim() && directorGuess.trim()) {
      const m = activeMovies.find(mv => mv.id === currentTurn.movie_id);
      if (m) {
        const validIntervals = computeValidIntervals(m.year, getActivePlayerTimeline());
        const isCorrect = currentTurn.placed_interval !== null &&
          validIntervals.includes(currentTurn.placed_interval);
        if (isCorrect) {
          const titleOK = movieGuess.trim().toLowerCase() === m.title.toLowerCase();
          const directorOK = directorGuess.trim().toLowerCase() === (m.director ?? '').toLowerCase();
          if (titleOK && directorOK) {
            const myPlayer = players.find(p => p.id === myPlayerId);
            if (myPlayer) {
              await db.from('players').update({ coins: myPlayer.coins + 1 }).eq('id', myPlayerId);
            }
          }
        }
      }
    }
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

  async function startVoice() {
    setVoiceError('');
    if (!speechAvailable) {
      voiceStateRef.current = 'error';
      setVoiceError('Voice input not available. Please type instead.');
      setVoiceState('error');
      return;
    }
    const { granted } = await SpeechModule.requestPermissionsAsync();
    if (!granted) {
      voiceStateRef.current = 'error';
      setVoiceError('Microphone permission denied. Please type instead.');
      setVoiceState('error');
      return;
    }
    voiceStateRef.current = 'listening';
    setVoiceState('listening');
    SpeechModule.start({ lang: 'en-US', continuous: false, interimResults: false });
  }

  function stopVoice() {
    SpeechModule.stop();
    // State updated by the 'end' event handler
  }

  async function handleNextTurn() {
    // Guard: prevent double-tap on this device
    if (nextTurnInProgress.current) return;
    nextTurnInProgress.current = true;
    try {
      const g = game;
      if (!g || !currentTurn) return;

      // Atomically claim this turn: only update to 'done' if still in 'revealing'.
      // If two devices race here, only one will match the WHERE clause and get rows back.
      const { data: claimed } = await db
        .from('turns')
        .update({ status: 'done' as any })
        .eq('id', currentTurn.id)
        .eq('status', 'revealing')
        .select('id') as { data: { id: string }[] | null };
      if (!claimed || claimed.length === 0) return; // Another device already processed it

      const movie = getMovie();
      if (!movie) return;

      // Fetch fresh player data so winner.timeline is never stale
      const { data: freshPlayers } = await db
        .from('players').select('*').eq('game_id', g.id).order('created_at') as { data: Player[] | null };
      const latestPlayers: Player[] = freshPlayers ?? players;
      if (freshPlayers) { setLocalPlayers(freshPlayers); setPlayers(freshPlayers); }

      const activeTL = latestPlayers.find(p => p.id === currentTurn.active_player_id)?.timeline ?? [];
      const validIntervals = computeValidIntervals(movie.year, activeTL);
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
        const winner = latestPlayers.find(p => p.id === winnerId) ?? null;
        if (winner) {
          const newTimeline = [...winner.timeline, movie.year].sort((a, b) => a - b);
          await db.from('players').update({ timeline: newTimeline }).eq('id', winnerId);
        }
      }

      const currentIdx = latestPlayers.findIndex((p) => p.id === currentTurn.active_player_id);
      const nextPlayer = latestPlayers[(currentIdx + 1) % latestPlayers.length];

      const { data: pastTurns } = await db
        .from('turns')
        .select('movie_id')
        .eq('game_id', g.id);
      const usedMovieIds = new Set<string>(pastTurns?.map((t: { movie_id: string }) => t.movie_id) ?? []);
      // Also exclude starting cards (added directly to timelines, never in a turn row)
      latestPlayers.forEach(p => {
        p.timeline.forEach(year => {
          const mv = activeMovies.find(m => m.year === year);
          if (mv) usedMovieIds.add(mv.id);
        });
      });
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
    } finally {
      nextTurnInProgress.current = false;
    }
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
        onDone={() => {
          introShownRef.current = true;
          setShowIntro(false);
          setShowLandscapePrompt(true);
        }}
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

  // Only use the ACTIVE player's movies for timeline display.
  // Using all players caused wrong movies to appear when multiple movies share the same year.
  const placedMovies: Movie[] = timeline
    .map((year) => activeMovies.find((mv) => mv.year === year))
    .filter((m): m is Movie => m !== undefined);

  // My own timeline (for "my timeline" modal and drawing phase display)
  const myTimeline = (players.find(p => p.id === myPlayerId)?.timeline ?? []).slice().sort((a, b) => a - b);
  const myPlacedMovies: Movie[] = myTimeline
    .map(year => activeMovies.find(m => m.year === year))
    .filter((m): m is Movie => m !== undefined);

  // ── "My Timeline" modal — overlaid on every game screen ──
  const myTimelineModal = (
    <Modal visible={showMyTimeline} transparent animationType="slide" onRequestClose={() => setShowMyTimeline(false)}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowMyTimeline(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.myTimelineSheet}>
          <View style={styles.myTimelineHeader}>
            <Text style={styles.myTimelineTitle}>My Timeline</Text>
            <TouchableOpacity onPress={() => setShowMyTimeline(false)} style={styles.reportCloseBtn}>
              <Text style={styles.reportCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          {myTimeline.length === 0 ? (
            <Text style={styles.myTimelineEmpty}>No cards yet</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.myTimelineScroll}>
              {myTimeline.map((year, i) => {
                const m = activeMovies.find(mv => mv.year === year);
                return m
                  ? <CardFront key={i} movie={m} width={90} height={126} />
                  : <View key={i} style={styles.myTimelinePlaceholder}><Text style={styles.myTimelinePlaceholderYear}>{year}</Text></View>;
              })}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // ── DRAWING ──
  if (currentTurn.status === 'drawing') {
    const drawingTimeline = myTimeline;
    const drawingPlacedMovies = myPlacedMovies;
    return (
      <SafeAreaView style={styles.container}>
        {myTimelineModal}
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
            </>
          )}
        </View>
        {drawingTimeline.length > 0 && movie && (
          <Timeline
            timeline={drawingTimeline}
            currentCardMovie={movie}
            interactive={false}
            selectedInterval={null}
            onIntervalSelect={() => {}}
            onConfirm={() => {}}
            placedMovies={drawingPlacedMovies}
            hideFloatingCard
          />
        )}
        <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
      </SafeAreaView>
    );
  }

  // ── PLACING ──
  if (currentTurn.status === 'placing') {
    if (!movie) return <LoadingScreen />;

    // ── Observer: active player clicked "I know it!" — show waiting screen ──
    if (!amActive && currentTurn.placed_interval === -1) {
      return (
        <SafeAreaView style={styles.container}>
          {myTimelineModal}
          <View style={styles.placingTopHalf}>
            <Text style={styles.phaseLabel}>Waiting for {activePlayer?.display_name}…</Text>
            <View style={styles.floatingCardWrapper}>
              <CardBack width={80} height={CARD_H} />
            </View>
          </View>
          <View style={styles.placingBottomHalf}>
            <Timeline
              timeline={timeline}
              currentCardMovie={movie}
              interactive={false}
              selectedInterval={null}
              onIntervalSelect={() => {}}
              onConfirm={() => {}}
              placedMovies={placedMovies}
              hideFloatingCard
            />
          </View>
          <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
        </SafeAreaView>
      );
    }

    // ── Timeline (after trailer + ready) ──
    if (readyToPlace) {
      return (
        <SafeAreaView style={styles.container}>
          {myTimelineModal}
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
                <CardBack width={80} height={CARD_H} />
              </Animated.View>
            </View>
          </View>

          {/* Bottom half: timeline */}
          <View style={styles.placingBottomHalf}>
            {amActive && selectedInterval === null && (
              <Text style={styles.tapHint}>Tap + to pick a spot</Text>
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

          <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
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
        // No KeyboardAvoidingView — it fights with the landscape→portrait orientation
        // transition and causes non-stop layout thrashing on iOS.
        // automaticallyAdjustKeyboardInsets is a native iOS scroll-inset mechanism
        // that is unaffected by orientation changes.
        <SafeAreaView style={styles.guessScreen} edges={['top', 'bottom']}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.guessScrollContent}
          >
            {/* Header */}
            <View style={styles.guessHeader}>
              <Text style={styles.guessTitle}>🎬 Ready to guess?</Text>
              <Text style={styles.guessSubtitle}>WHAT YEAR IS THIS MOVIE FROM?</Text>
            </View>

            {/* Bonus coin section */}
            <View style={styles.guessBonusSection}>
              <Text style={styles.guessBonusLabel}>🪙 Bonus coin</Text>
              <Text style={styles.guessBonusDesc}>Name the movie + director to earn an extra coin</Text>

              <TextInput
                style={styles.guessInput}
                placeholder="Movie title…"
                placeholderTextColor={C.textMuted}
                value={movieGuess}
                onChangeText={setMovieGuess}
                autoCorrect={false}
                returnKeyType="next"
              />
              <TextInput
                style={styles.guessInput}
                placeholder="Director name…"
                placeholderTextColor={C.textMuted}
                value={directorGuess}
                onChangeText={setDirectorGuess}
                autoCorrect={false}
                returnKeyType="done"
              />

              {/* OR divider */}
              <View style={styles.guessOrRow}>
                <View style={styles.guessOrLine} />
                <Text style={styles.guessOrText}>OR</Text>
                <View style={styles.guessOrLine} />
              </View>

              {/* Voice input */}
              {voiceState === 'idle' && (
                <TouchableOpacity style={styles.voiceMicBtn} onPress={startVoice} activeOpacity={0.75}>
                  <Text style={styles.voiceMicIcon}>🎤</Text>
                  <Text style={styles.voiceMicText}>Speak your answer</Text>
                </TouchableOpacity>
              )}
              {voiceState === 'listening' && (
                <TouchableOpacity style={[styles.voiceMicBtn, styles.voiceMicBtnListening]} onPress={stopVoice} activeOpacity={0.75}>
                  <Text style={styles.voiceMicIcon}>🎤</Text>
                  <Text style={styles.voiceMicText}>Listening… tap to stop</Text>
                </TouchableOpacity>
              )}
              {voiceState === 'processing' && (
                <View style={[styles.voiceMicBtn, { opacity: 0.7 }]}>
                  <ActivityIndicator color={C.gold} size="small" />
                  <Text style={styles.voiceMicText}>Interpreting…</Text>
                </View>
              )}
              {voiceState === 'error' && (
                <View style={styles.voiceErrorBox}>
                  <Text style={styles.voiceErrorText}>{voiceError}</Text>
                  <TouchableOpacity onPress={() => { voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceError(''); }}>
                    <Text style={styles.voiceRetryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Footer inside scroll so it's always reachable above the keyboard */}
            <View style={styles.guessFooter}>
              {!hasReplayed && (
                <TouchableOpacity
                  style={styles.guessReplayBtn}
                  onPressIn={() => {
                    setHasReplayed(true);
                    setTrailerEnded(false);
                    setUserPaused(false);
                    setTrailerKey(k => k + 1);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.guessReplayText}>↺ Replay</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.guessSkipBtn}
                onPressIn={() => { setMovieGuess(''); setDirectorGuess(''); setReadyToPlace(true); }}
                activeOpacity={0.7}
              >
                <Text style={styles.guessSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guessPlaceBtn}
                onPressIn={() => setReadyToPlace(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.guessPlaceText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }

    // ── Trailer playing ──
    return (
      <View style={styles.trailerContainer}>
        <TrailerPlayer
          key={`${currentTurn.id}-${trailerKey}`}
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
                onPress={() => {
                  trailerRef.current?.stop();
                  setTrailerEnded(true);
                  setUserPaused(false);
                  // Signal to observers: placed_interval = -1 means "I know it" phase
                  if (currentTurn) {
                    db.from('turns').update({ placed_interval: -1 }).eq('id', currentTurn.id);
                  }
                }}
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
    if (!movie) return <LoadingScreen />;

    const alreadyDecided = hasPassed || myChallenge !== null;
    const takenSet = new Set<number>();
    if (currentTurn.placed_interval !== null && currentTurn.placed_interval !== undefined) {
      takenSet.add(currentTurn.placed_interval);
    }
    challenges.forEach(c => { if (c.interval_index !== -1) takenSet.add(c.interval_index); });
    const blockedIntervals = Array.from(takenSet);
    const canChallenge = (timeline.length + 1) - takenSet.size > 0;

    // Dynamic status message visible to all players
    const pickingNow = challenges.filter(c => c.interval_index === -1);
    const confirmedC = challenges.filter(c => c.interval_index !== -1);
    let statusMsg: string;
    let statusEmoji: string | null = null;
    if (pickingNow.length > 0) {
      const names = pickingNow.map(c => getPlayer(c.challenger_id)?.display_name ?? '?').join(', ');
      statusMsg = `${names} is picking a spot…`;
      statusEmoji = '🤔';
    } else if (confirmedC.length > 0) {
      const names = confirmedC.map(c => getPlayer(c.challenger_id)?.display_name ?? '?').join(', ');
      statusMsg = `${names} challenged! Revealing soon…`;
      statusEmoji = '🎯';
    } else {
      statusMsg = 'Waiting for everyone to decide…';
    }

    return (
      <SafeAreaView style={styles.container}>
        {myTimelineModal}
        {/* Full-width timeline + centered status overlay */}
        <View style={styles.challengeTimelineArea}>
          <Timeline
            timeline={timeline}
            currentCardMovie={movie}
            interactive={false}
            selectedInterval={null}
            onIntervalSelect={() => {}}
            onConfirm={() => {}}
            placedInterval={currentTurn.placed_interval}
            placedMovies={placedMovies}
          />
          {/* Status message floats centered over the timeline */}
          <View style={styles.challengeOverlayWrap} pointerEvents="none">
            <View style={styles.challengeOverlayCard}>
              {statusEmoji
                ? <Text style={styles.challengeOverlayIcon}>{statusEmoji}</Text>
                : <ActivityIndicator size="small" color={C.gold} />}
              <Text style={styles.challengeOverlayText}>{statusMsg}</Text>
            </View>
          </View>
        </View>

        {/* Challenger: interval picker (before confirming) */}
        {!amActive && myChallenge && !challengeConfirmed && (
          <View style={styles.challengePickStrip}>
            <Text style={styles.challengePickTitle}>Where would YOU place it?</Text>
            <Timeline
              timeline={timeline}
              currentCardMovie={movie}
              interactive
              selectedInterval={challengeInterval}
              onIntervalSelect={setChallengeInterval}
              onConfirm={handleConfirmChallengeInterval}
              placedMovies={placedMovies}
              blockedIntervals={blockedIntervals}
            />
            {challengeInterval === null && (
              <Text style={styles.tapHint}>Tap + to pick a spot</Text>
            )}
          </View>
        )}

        {/* Non-active players who haven't decided yet: Challenge / Pass */}
        {!amActive && !alreadyDecided && (() => {
          const myPlayerObj = players.find(p => p.id === myPlayerId);
          const hasCoins = (myPlayerObj?.coins ?? 0) > 0;
          return (
            <View style={styles.challengeDecideStrip}>
              {canChallenge ? (
                <>
                  <ChallengeTimer seconds={5} onExpire={() => setHasPassed(true)} size={108}>
                    <TouchableOpacity
                      style={[styles.challengeBtnCircle, !hasCoins && { opacity: 0.35 }]}
                      onPress={hasCoins ? handleChallenge : undefined}
                      activeOpacity={hasCoins ? 0.7 : 1}
                    >
                      <Text style={styles.challengeBtnText}>
                        {hasCoins ? 'Challenge' : 'No coins'}
                      </Text>
                    </TouchableOpacity>
                  </ChallengeTimer>
                  <TouchableOpacity style={[styles.passBtn, { flex: 1 }]} onPress={() => setHasPassed(true)}>
                    <Text style={styles.passBtnText}>Pass</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={[styles.passBtn, { flex: 1 }]} onPress={() => setHasPassed(true)}>
                  <Text style={styles.passBtnText}>All spots taken — Pass</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Active player: manual reveal button — only enabled once challenge window closed */}
        {amActive && (() => {
          const pendingChallengers = challenges.some(c => c.interval_index === -1);
          const canRevealNow = !revealLocked && !pendingChallengers;
          return (
            <View style={styles.challengeDecideStrip}>
              <TouchableOpacity
                style={[styles.revealNowBtn, { flex: 1 }, !canRevealNow && { opacity: 0.35 }]}
                onPress={canRevealNow ? handleReveal : undefined}
                activeOpacity={canRevealNow ? 0.85 : 1}
              >
                <Text style={styles.revealNowBtnText}>
                  {revealLocked ? 'Waiting for decisions…' : pendingChallengers ? 'Challenger deciding…' : 'Reveal →'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
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
    const winningChallenger = activeCorrect
      ? null
      : challenges.find((c) => c.interval_index !== -1 && validIntervals.includes(c.interval_index));
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

    let resultText = 'Nobody got it — card trashed';
    let resultName = '';
    if (activeCorrect) {
      resultName = activePlayer?.display_name ?? '';
      resultText = 'got it right!';
    } else if (winningChallenger) {
      resultName = getPlayer(winningChallenger.challenger_id)?.display_name ?? '';
      resultText = 'challenged correctly!';
    }

    const isTrash = !activeCorrect && !winningChallenger;

    // Bonus coin feedback — only meaningful on the active player's device since
    // movieGuess/directorGuess are local state
    const didSubmitBonus = amActive && movieGuess.trim() !== '' && directorGuess.trim() !== '';
    const gotBonusCoin = didSubmitBonus && activeCorrect &&
      movieGuess.trim().toLowerCase() === m.title.toLowerCase() &&
      directorGuess.trim().toLowerCase() === (m.director ?? '').toLowerCase();

    // Show winner's timeline with the card inserted at the correct position
    const winnerId = activeCorrect ? currentTurn.active_player_id : winningChallenger?.challenger_id ?? null;
    const winnerPlayer = winnerId ? getPlayer(winnerId) : null;
    const winnerTimeline = winnerPlayer
      ? (winnerPlayer.timeline ?? []).slice().sort((a, b) => a - b)
      : timeline;
    const revealInterval = winnerPlayer
      ? computeCorrectInterval(m.year, winnerTimeline)
      : currentTurn.placed_interval;

    // Phase 'flip': always show ACTIVE PLAYER's timeline with card flipping at placed_interval
    // Phase 'result': show WINNER's timeline (filter m.year to avoid duplicate) + result strip
    const displayTimeline = revealPhase === 'flip'
      ? timeline  // active player's timeline
      : winnerTimeline.filter(y => y !== m.year);  // winner's timeline minus the card being inserted
    const displayInterval = revealPhase === 'flip'
      ? currentTurn.placed_interval
      : revealInterval;

    // Use the display timeline's own movies for lookup — avoids cross-player year collisions
    const revealPlacedMovies: Movie[] = displayTimeline
      .map((year) => activeMovies.find((mv) => mv.year === year))
      .filter((mv): mv is Movie => mv !== undefined);

    return (
      <SafeAreaView style={styles.container}>
        {myTimelineModal}
        <View style={styles.revealTimelineWrapper}>
          <Timeline
            timeline={displayTimeline}
            currentCardMovie={m}
            interactive={false}
            selectedInterval={null}
            onIntervalSelect={() => {}}
            onConfirm={() => {}}
            placedInterval={displayInterval}
            placedMovies={revealPlacedMovies}
            revealingMovie={m}
          />
        </View>

        {/* Result + button — appears after the flip completes */}
        {revealPhase === 'result' && (
          <>
            {winningChallenger && (
              <View style={styles.revealTransferBanner}>
                <Text style={styles.revealTransferText}>
                  ↓ Card moves to {getPlayer(winningChallenger.challenger_id)?.display_name}'s timeline
                </Text>
              </View>
            )}
            <View style={styles.revealResultStrip}>
              <Text style={styles.revealResultEmoji}>
                {activeCorrect ? '🎉' : winningChallenger ? '🎯' : '🗑️'}
              </Text>
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
                {didSubmitBonus && (
                  <Text style={styles.revealCoinBack}>
                    {gotBonusCoin
                      ? <><Text style={styles.revealCoinBackName}>🪙 +1 bonus coin!</Text>{' Movie + director correct'}</>
                      : '❌ No bonus coin — movie or director incorrect'}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.revealFooter}>
              <TouchableOpacity style={styles.revealNextBtn} onPress={handleNextTurn} activeOpacity={0.85}>
                <Text style={styles.revealNextBtnText}>Next Player →</Text>
              </TouchableOpacity>
            </View>

            {/* Confetti burst when active player got it right */}
            {activeCorrect && <ConfettiBurst />}

            {/* Card flies to trash when nobody got it right */}
            {isTrash && <TrashCard movie={m} />}
          </>
        )}

        <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
      </SafeAreaView>
    );
  }

  return <LoadingScreen />;
}

function ScoreBar({ players, myId, onShowTimeline }: { players: Player[]; myId: string | null; onShowTimeline?: () => void }) {
  return (
    <View style={styles.scoreBarRow}>
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
            <Text style={styles.scoreChipCoins}>🪙{p.coins}</Text>
          </View>
        ))}
      </ScrollView>
      {onShowTimeline && (
        <TouchableOpacity style={styles.timelineBtn} onPress={onShowTimeline}>
          <View style={styles.timelineBtnIcon}>
            <View style={styles.timelineMiniCard} />
            <View style={styles.timelineMiniLine} />
            <View style={styles.timelineMiniCard} />
            <View style={styles.timelineMiniLine} />
            <View style={styles.timelineMiniCard} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#f5c518" />
    </SafeAreaView>
  );
}

// ── Confetti burst (correct answer) ──────────────────────────────────────────

const CONFETTI_COLORS = ['#f5c518', '#e63946', '#2a9d8f', '#e9c46a', '#f4a261', '#ffffff', '#c77dff', '#ff6b6b'];
const CONFETTI_COUNT = 28;

function ConfettiBurst() {
  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      const angle = (i / CONFETTI_COUNT) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 1.0;
      const speed = 90 + Math.random() * 170;
      return {
        anim: new Animated.Value(0),
        dx: Math.cos(angle + jitter) * speed,
        dy: Math.sin(angle + jitter) * speed - 60,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 5 + Math.floor(Math.random() * 7),
        spins: Math.random() * 6 - 3,
      };
    })
  ).current;

  useEffect(() => {
    Animated.stagger(
      22,
      particles.map(p =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: 850 + Math.random() * 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const ty = p.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.dy, p.dy + 80] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] });
        const rotate = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.spins * 360}deg`],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: '42%',
              alignSelf: 'center',
              width: p.size,
              height: p.size,
              borderRadius: p.size / 4,
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

// ── Trash animation (nobody got it right) ────────────────────────────────────

function TrashCard({ movie }: { movie: Movie }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 700,
      delay: 300,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 260] });
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -200] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '55deg'] });
  const opacity = anim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.85, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        alignSelf: 'center',
        top: '30%',
        zIndex: 50,
        opacity,
        transform: [{ translateX: tx }, { translateY: ty }, { rotate }],
      }}
    >
      <CardFront movie={movie} width={80} height={100} />
    </Animated.View>
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
const WHEEL_TOTAL_SPIN = 7 * 360 + 90 - (WHEEL_HIGHLIGHT_IDX / WHEEL_CARD_COUNT) * 360; // 2490°
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

  // Context screen shown before spin — player must tap "Let's spin!" to begin
  const [started, setStarted] = useState(false);
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
  // flipAnim: 0 = back visible, 1 = front visible (3D rotateY card flip)
  const flipAnim       = useRef(new Animated.Value(0)).current;
  // tapHintOpacity: fades in the "Tap to continue" prompt after flip completes
  const tapHintOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity  = useRef(new Animated.Value(0)).current;
  const contextOpacity = useRef(new Animated.Value(1)).current;

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

  // Card flip interpolations — back spins out, front spins in around Y axis
  const backRotY   = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg',   '90deg',  '90deg'] });
  const frontRotY  = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg']  });
  // Snap visibility at the midpoint so neither face is visible edge-on
  const backFace   = flipAnim.interpolate({ inputRange: [0, 0.499, 0.5], outputRange: [1, 1, 0] });
  const frontFace  = flipAnim.interpolate({ inputRange: [0, 0.5, 0.501], outputRange: [0, 0, 1] });

  // Kick off wheel animation when player presses "Let's spin!"
  useEffect(() => {
    if (!started) return;

    // Fade context screen out, then run the wheel
    Animated.sequence([
      Animated.timing(contextOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(screenOpacity,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(wheelRotation, {
        toValue: WHEEL_TOTAL_SPIN,
        duration: 5500,
        // inOut cubic: eases in slowly, peaks at mid-spin, then decelerates
        // — avoids the jarring high-velocity start that caused frame drops
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(600),
    ]).start(() => {
      setSpinDone(true);

      // Phase 2: arrow + others vanish, highlight card glides to center then flips
      Animated.sequence([
        Animated.parallel([
          Animated.timing(otherOpacity,   { toValue: 0,             duration: 350, useNativeDriver: true }),
          Animated.timing(arrowOpacity,   { toValue: 0,             duration: 250, useNativeDriver: true }),
          Animated.timing(highlightX,     { toValue: -WHEEL_RADIUS, duration: 700, easing: Easing.out(Easing.cubic),      useNativeDriver: true }),
          Animated.timing(highlightScale, { toValue: 1.8,           duration: 700, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }),
        ]),
        Animated.delay(150),
        // 3D card flip: back → front
        Animated.timing(flipAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(100),
        // "Tap to continue" prompt appears; player must tap to advance
        Animated.timing(tapHintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        canDismiss.current = true; // enable tap-to-advance only after prompt is visible
      });
    });
  }, [started]);

  // Both screens are always mounted — we switch between them via opacity so that
  // both Animated.Values remain attached to native views throughout (avoids
  // Animated.sequence silently aborting when it tries to animate a detached value).
  return (
    <View style={introStyles.screen}>

      {/* ── Context screen (shown first, fades out on "Let's spin!") ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: contextOpacity }]}
        pointerEvents={started ? 'none' : 'auto'}
      >
        <SafeAreaView style={introStyles.contextInner} edges={['top', 'bottom']}>
          <View style={introStyles.contextBody}>
            <Text style={introStyles.contextTitle}>Time to spin</Text>
            <Text style={introStyles.contextDesc}>
              {playerName}, we'll randomly draw a movie to kick off your timeline.
            </Text>
          </View>
          <TouchableOpacity
            style={introStyles.spinBtn}
            onPress={() => setStarted(true)}
            activeOpacity={0.75}
          >
            <Text style={introStyles.spinBtnText}>Let's spin! 🎰</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </SafeAreaView>
      </Animated.View>

      {/* ── Wheel screen (fades in after "Let's spin!") ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: screenOpacity }]}
        pointerEvents={started ? 'auto' : 'none'}
      >
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
                          // Wheel has stopped: 3D rotateY flip back → front
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
                          style={[StyleSheet.absoluteFill, introStyles.cardRing, { opacity: frontFace }]}
                          pointerEvents="none"
                        />
                      )}
                    </Animated.View>
                  );
                })}
              </Animated.View>
            </View>

            <View style={introStyles.footer}>
              <Animated.Text style={[introStyles.tapHint, { opacity: tapHintOpacity }]}>
                Tap anywhere to continue
              </Animated.Text>
            </View>

          </SafeAreaView>
        </TouchableOpacity>
      </Animated.View>

    </View>
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
    fontSize: 40,
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
  // Context screen (before spin starts)
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
    color: C.textPrimary,
    fontSize: FS['2xl'],
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  contextDesc: {
    color: C.textMuted,
    fontSize: FS.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  spinBtn: {
    backgroundColor: C.gold,
    borderRadius: R.btn,
    paddingHorizontal: 36,
    paddingVertical: 16,
  },
  spinBtnText: {
    color: C.textOnGold,
    fontSize: FS.lg,
    fontWeight: '900',
    letterSpacing: 0.5,
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

  challengeTimelineArea: { flex: 1 },
  challengeOverlayWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeOverlayCard: {
    backgroundColor: 'rgba(10, 6, 24, 0.88)',
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    maxWidth: 260,
  },
  challengeOverlayIcon: { fontSize: 24 },
  challengeOverlayText: {
    color: C.textSub,
    fontSize: FS.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  challengePickStrip: {
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingVertical: 6,
    gap: 4,
  },
  challengePickTitle: {
    color: C.textMuted,
    fontSize: FS.xs,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  challengeDecideStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.borderSubtle,
  },
  challengeBtn: { backgroundColor: C.danger, borderRadius: R.sm, paddingVertical: 10, alignItems: 'center' },
  challengeBtnText: { color: C.textPrimary, fontSize: FS.base, fontWeight: '800' },
  passBtn: {
    borderRadius: R.sm, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  passBtnText: { color: C.textSub, fontSize: FS.base, fontWeight: '600' },
  revealNowBtn: {
    borderRadius: R.sm, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.gold, backgroundColor: 'rgba(245,197,24,0.12)',
  },
  revealNowBtnText: { color: C.gold, fontSize: FS.base, fontWeight: '700' },

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

  scoreBarRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  scoreBar: { flexGrow: 1 },
  scoreBarContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', alignItems: 'center' },
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  scoreChipMe: { borderWidth: 1, borderColor: C.gold },
  scoreChipName: { color: C.textSub, fontSize: FS.sm, fontWeight: '600' },
  scoreChipCount: { color: C.gold, fontSize: FS.sm, fontWeight: '800' },

  timelineBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  timelineBtnIcon: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timelineMiniCard: { width: 7, height: 10, borderRadius: 1.5, backgroundColor: 'rgba(245,197,24,0.75)' },
  timelineMiniLine: { width: 4, height: 1.5, backgroundColor: 'rgba(245,197,24,0.35)' },

  // My Timeline modal
  myTimelineSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: R.card, borderTopRightRadius: R.card,
    padding: 20, paddingBottom: 32,
    gap: 16,
  },
  myTimelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myTimelineTitle: { color: C.textPrimary, fontSize: FS.lg, fontWeight: '800' },
  myTimelineEmpty: { color: C.textMuted, fontSize: FS.base, textAlign: 'center', paddingVertical: 16 },
  myTimelineScroll: { gap: 8, paddingVertical: 4 },
  myTimelinePlaceholder: {
    width: 90, height: 126, backgroundColor: C.bg,
    borderRadius: R.md, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  myTimelinePlaceholderYear: { color: C.gold, fontSize: FS.md, fontWeight: '800' },

  // Challenge button circle (inside ChallengeTimer ring)
  challengeBtnCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(230,57,70,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Bonus coin guess inputs (trailerEnded screen)
  bonusCoinBox: {
    alignItems: 'stretch', gap: 8, marginTop: 12, width: '100%', paddingHorizontal: 16,
  },
  bonusCoinHint: {
    color: C.gold, fontSize: FS.xs, fontWeight: '700',
    textAlign: 'center', letterSpacing: 0.5, textTransform: 'uppercase',
  },
  guessInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 12,
    color: C.textPrimary, fontSize: FS.base,
  },

  // ── Portrait guess screen (trailer ended, active player) ──
  guessScreen: {
    flex: 1, backgroundColor: C.bg,
    paddingHorizontal: 24,
  },
  guessScrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  guessHeader: {
    alignItems: 'center', paddingTop: 24, paddingBottom: 16, gap: 8,
  },
  guessTitle: {
    color: C.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: 0.5,
  },
  guessSubtitle: {
    color: C.gold, fontSize: FS.xs, fontWeight: '700',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  guessBonusSection: {
    gap: 12, paddingTop: 4,
  },
  guessBonusLabel: {
    color: C.gold, fontSize: FS.sm, fontWeight: '700',
    letterSpacing: 0.5, textAlign: 'center',
  },
  guessBonusDesc: {
    color: C.textMuted, fontSize: FS.sm, textAlign: 'center', lineHeight: 18, marginBottom: 4,
  },
  guessOrRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2,
  },
  guessOrLine: {
    flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border,
  },
  guessOrText: {
    color: C.textMuted, fontSize: FS.xs, fontWeight: '700', letterSpacing: 1.5,
  },
  voiceMicBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: R.card,
    backgroundColor: 'rgba(245,197,24,0.07)',
    borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.3)',
  },
  voiceMicBtnListening: {
    borderColor: C.gold, backgroundColor: 'rgba(245,197,24,0.14)',
  },
  voiceMicIcon: { fontSize: 22 },
  voiceMicText: {
    color: C.gold, fontSize: FS.base, fontWeight: '700',
  },
  voiceErrorBox: {
    backgroundColor: 'rgba(230,57,70,0.08)',
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.3)',
    borderRadius: R.sm, padding: 14, gap: 8, alignItems: 'center',
  },
  voiceErrorText: {
    color: C.textSub, fontSize: FS.sm, textAlign: 'center', lineHeight: 18,
  },
  voiceRetryText: {
    color: C.gold, fontSize: FS.sm, fontWeight: '700',
  },
  guessFooter: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 20, gap: 10,
  },
  guessReplayBtn: {
    flex: 1, height: 52, borderRadius: R.card,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  guessReplayText: { color: C.textSub, fontSize: FS.base, fontWeight: '600' },
  guessSkipBtn: {
    flex: 1, height: 52, borderRadius: R.card,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  guessSkipText: {
    color: C.textSub, fontSize: FS.md, fontWeight: '700',
  },
  guessPlaceBtn: {
    flex: 1, height: 52, backgroundColor: C.gold, borderRadius: R.card,
    alignItems: 'center', justifyContent: 'center',
  },
  guessPlaceText: {
    color: C.textOnGold, fontSize: FS.md, fontWeight: '900', letterSpacing: 0.4,
  },

  // Reveal transfer banner (challenger win)
  revealTransferBanner: {
    backgroundColor: 'rgba(245,197,24,0.1)',
    borderTopWidth: 1, borderTopColor: 'rgba(245,197,24,0.3)',
    paddingVertical: 6, paddingHorizontal: 20, alignItems: 'center',
  },
  revealTransferText: { color: C.gold, fontSize: FS.sm, fontWeight: '700' },

  // Coin count in ScoreBar
  scoreChipCoins: { color: C.textMuted, fontSize: FS.xs, fontWeight: '600' },
});
