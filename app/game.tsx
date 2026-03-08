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
  BackHandler,
  Alert,
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
import Svg, { Circle, Path } from 'react-native-svg';

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
const WIN_CARDS = 10;

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
    startingMovieIds,
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
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

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
  // Ordered list of { year, id } pairs for MY timeline — one entry per card in insertion order.
  // Sorted by year so index i aligns with myTimeline.sort()[i].
  // Handles duplicate years (e.g. two 2024 films) correctly.
  const [myMoviePairs, setMyMoviePairs] = useState<{ year: number; id: string }[]>([]);
  const [gameOver, setGameOver] = useState<Player | null>(null);
  const introShownRef = useRef(false);

  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState('');
  const voiceStateRef = useRef<'idle' | 'listening' | 'processing' | 'error'>('idle');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so the interval always has the latest values
  const currentTurnRef = useRef<Turn | null>(null);
  const gameIdRef = useRef<string | null>(null);

  // Portrait during intro + landscape prompt; landscape for everything after
  useEffect(() => {
    if (loading || showIntro || showLandscapePrompt) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
  }, [loading, showIntro, showLandscapePrompt]);

  useEffect(() => {
    if (!game) { router.replace('/'); return; }
    gameIdRef.current = game.id;
    loadState();
    return () => stopPolling();
  }, []);

  // Intercept Android hardware back button — show in-app confirmation dialog.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowLeaveDialog(true);
      return true; // prevents default back action
    });
    return () => sub.remove();
  }, []);

  // Switch from 'flip' → 'result' after the FlippingMovieCard animation completes.
  // Fetch fresh challenges at the 1200ms mark (not fire-and-forget) so the result
  // is guaranteed to have current data before it renders. Only challenges are
  // fetched here — updating players mid-reveal can mutate `timeline` and cause
  // `activeCorrect` to flicker if another device already ran handleNextTurn.
  useEffect(() => {
    if (currentTurn?.status !== 'revealing') return;
    setRevealPhase('flip');
    const turn = currentTurnRef.current;
    const t = setTimeout(async () => {
      if (turn) {
        const { data: cData } = await db.from('challenges').select('*').eq('turn_id', turn.id);
        if (cData) { setLocalChallenges(cData); setChallenges(cData); }
      }
      setRevealPhase('result');
    }, 1200);
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

  useSpeechRecognitionEvent('error', (event) => {
    if (voiceStateRef.current === 'idle') return;
    voiceStateRef.current = 'error';
    setVoiceError(event?.message ?? 'Speech recognition failed. Please type instead.');
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

    // Fetch turn, game status, and players in parallel so all state updates can be
    // applied in a single synchronous block — React batches them into one render,
    // preventing any intermediate frame where currentTurn and players are out of sync.
    const [
      { data: latestTurn },
      { data: gameRow },
      { data: freshPlayers },
    ] = await Promise.all([
      db.from('turns').select('*').eq('game_id', gId).neq('status', 'complete')
        .order('created_at', { ascending: false }).limit(1).single() as Promise<{ data: Turn | null }>,
      db.from('games').select('status').eq('id', gId).single(),
      db.from('players').select('*').eq('game_id', gId).order('created_at'),
    ]);

    if (gameRow?.status === 'finished') {
      const fp = (freshPlayers ?? []) as Player[];
      const winner = fp.reduce((best: Player | null, p) =>
        !best || p.timeline.length > best.timeline.length ? p : best, null);
      if (winner) {
        setLocalPlayers(fp);
        setPlayers(fp);
        setGameOver(winner);
        stopPolling();
      }
      return;
    }

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
          // Apply fresh players in the same synchronous block as setLocalTurn so React
          // batches them into one render — no intermediate frame where currentTurn is the
          // new drawing turn but players still has the old timeline (or vice versa).
          // The DB timeline is always written before the new turn is inserted, so this is safe.
          if (freshPlayers) { setLocalPlayers(freshPlayers as Player[]); setPlayers(freshPlayers as Player[]); }

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

  }

  async function loadState() {
    const g = game;
    if (!g) return;
    setLoading(true);

    const [{ data: pData }, { data: tData }] = await Promise.all([
      db.from('players').select('*').eq('game_id', g.id).order('created_at'),
      db.from('turns').select('*').eq('game_id', g.id)
        .neq('status', 'complete').order('created_at', { ascending: false }).limit(1).single(),
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

    // Build ordered pairs for my timeline so the modal shows the correct movie per slot,
    // even when multiple movies share the same year.
    // Strategy: prefer movies that appear in the game's turns (won cards) over first-match.
    // usedIds prevents the same movie being assigned to two slots.
    const { data: allTurns } = await db
      .from('turns').select('movie_id').eq('game_id', g.id) as { data: { movie_id: string }[] | null };
    const turnMovieIds = new Set((allTurns ?? []).map(t => t.movie_id));
    const myTL = loadedPlayers.find(p => p.id === myPlayerId)?.timeline ?? [];
    const sortedTL = [...myTL].sort((a, b) => a - b);
    const usedIds = new Set<string>();
    const pairs: { year: number; id: string }[] = sortedTL.map(year => {
      const fromTurn = activeMovies.find(mv => mv.year === year && turnMovieIds.has(mv.id) && !usedIds.has(mv.id));
      const fallback  = activeMovies.find(mv => mv.year === year && !usedIds.has(mv.id));
      const best = fromTurn ?? fallback ?? activeMovies.find(mv => mv.year === year);
      if (best) usedIds.add(best.id);
      return { year, id: best?.id ?? '' };
    });
    setMyMoviePairs(pairs);

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

  // When the placed year already exists in the timeline, ALL intervals spanning the run of
  // same-year cards are valid (before the first, between any two, or after the last duplicate).
  function computeValidIntervals(year: number, timeline: number[]): number[] {
    const sorted = [...timeline].sort((a, b) => a - b);
    const firstDupIdx = sorted.indexOf(year);
    if (firstDupIdx !== -1) {
      const lastDupIdx = sorted.lastIndexOf(year);
      // e.g. [2024, 2024, 2025] + new 2024 → firstDup=0, lastDup=1 → [0, 1, 2]
      return Array.from({ length: lastDupIdx - firstDupIdx + 2 }, (_, k) => firstDupIdx + k);
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
    // Use the ref to avoid stale closure — placed_interval may be set by handleConfirmPlacement
    // after the poll closure was last captured, so currentTurn here could be stale.
    const ct = currentTurnRef.current ?? currentTurn;
    if (!ct) return;
    // Award coin to active player if placement correct AND they named the movie + director
    if (myPlayerId === ct.active_player_id && movieGuess.trim() && directorGuess.trim()) {
      const m = activeMovies.find(mv => mv.id === ct.movie_id);
      if (m) {
        const validIntervals = computeValidIntervals(m.year, getActivePlayerTimeline());
        const isCorrect = ct.placed_interval !== null &&
          validIntervals.includes(ct.placed_interval);
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
    const optimistic = { ...ct, status: 'revealing' as const };
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ status: 'revealing' }).eq('id', ct.id);
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
    SpeechModule.start({
      lang: 'en-US',
      continuous: false,
      interimResults: false,
      androidIntentOptions: {
        // Give the user enough time to say "Oppenheimer by Christopher Nolan"
        // without Android's VAD cutting off too early
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 8000,
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1000,
      },
    });
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
      // Use the ref so we never act on a stale closure value
      const ct = currentTurnRef.current;
      if (!g || !ct) return;

      const movie = activeMovies.find((m) => m.id === ct.movie_id) ?? null;
      if (!movie) return;

      // Fetch fresh player data BEFORE the cross-device guard so winner computation
      // and myMoviePairs sync happen on EVERY device, not just the one that "wins the race".
      const { data: freshPlayers } = await db
        .from('players').select('*').eq('game_id', g.id).order('created_at') as { data: Player[] | null };
      const latestPlayers: Player[] = freshPlayers ?? players;

      // Compute winner — needed here so myMoviePairs stays correct regardless of which
      // device inserts the next turn.
      const activeTL = latestPlayers.find(p => p.id === ct.active_player_id)?.timeline ?? [];
      const validIntervals = computeValidIntervals(movie.year, activeTL);
      const activeCorrect =
        ct.placed_interval !== null &&
        ct.placed_interval !== undefined &&
        validIntervals.includes(ct.placed_interval);
      const winningChallenger = activeCorrect
        ? null
        : challenges.find((c) => c.interval_index !== -1 && validIntervals.includes(c.interval_index));

      let winnerId: string | null = null;
      if (activeCorrect) winnerId = ct.active_player_id;
      else if (winningChallenger) winnerId = winningChallenger.challenger_id;

      // Sync myMoviePairs BEFORE the cross-device guard — this ensures that even when
      // another device processes the turn first (and we return early below), our local
      // display still shows the correct movie for each timeline slot.
      if (winnerId === myPlayerId) {
        setMyMoviePairs(prev => {
          if (prev.some(p => p.id === movie.id)) return prev; // idempotent
          return [...prev, { year: movie.year, id: movie.id }].sort((a, b) => a.year - b.year);
        });
      }

      // Guard against double-processing across devices: if a newer real turn already exists,
      // another device already handled this. Call poll() to sync UI then exit.
      const { data: existingNext } = await db
        .from('turns')
        .select('id')
        .eq('game_id', g.id)
        .neq('status', 'complete')
        .gt('created_at', ct.created_at)
        .limit(1) as { data: { id: string }[] | null };
      if (existingNext && existingNext.length > 0) {
        await poll();
        return;
      }

      let updatedPlayers = latestPlayers;
      if (winnerId) {
        const winner = latestPlayers.find(p => p.id === winnerId) ?? null;
        if (winner) {
          const newTimeline = [...winner.timeline, movie.year].sort((a, b) => a - b);
          await db.from('players').update({ timeline: newTimeline }).eq('id', winnerId);
          // Keep updatedPlayers for nextPlayer calculation only — don't push to state here.
          // poll() will re-fetch players when it detects the new turn, ensuring the drawing
          // phase gets the correct timeline without the reveal phase ever seeing it early.
          updatedPlayers = latestPlayers.map(p => p.id === winnerId ? { ...p, timeline: newTimeline } : p);

          // Game over — winner reached the target card count
          if (newTimeline.length >= WIN_CARDS) {
            await db.from('games').update({ status: 'finished' }).eq('id', g.id);
            setGameOver({ ...winner, timeline: newTimeline });
            stopPolling();
            return;
          }
        }
      }

      // If no players remain (everyone left), there's nothing to do.
      if (updatedPlayers.length === 0) return;
      const currentIdx = updatedPlayers.findIndex((p) => p.id === ct.active_player_id);
      // currentIdx is -1 when the active player deleted themselves (left mid-turn).
      // Fall back to index 0 so the game continues with the first remaining player.
      const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % updatedPlayers.length;
      const nextPlayer = updatedPlayers[nextIdx];

      const { data: pastTurns } = await db
        .from('turns')
        .select('movie_id')
        .eq('game_id', g.id);
      // All past turn movie_ids — includes phantom 'complete' turns for starting cards.
      // Build the exclusion set from three independent sources:
      // 1. All past turn movie IDs (includes phantom 'complete' turns when they exist)
      // 2. startingMovieIds from Zustand (host-device backup)
      // 3. Inferred starting card years: any year in a player's timeline that has no
      //    matching past turn must be a starting card year — robust against phantom turn
      //    failures and Zustand being unavailable on non-host devices.
      const pastTurnMovieIds = new Set<string>(pastTurns?.map((t: { movie_id: string }) => t.movie_id) ?? []);
      const pastTurnYears = new Set<number>(
        [...pastTurnMovieIds]
          .map(id => activeMovies.find(m => m.id === id)?.year)
          .filter((y): y is number => y !== undefined)
      );
      const startingCardYears = new Set<number>(
        latestPlayers.flatMap(p => p.timeline ?? []).filter(year => !pastTurnYears.has(year))
      );
      const usedMovieIds = new Set<string>([
        ...pastTurnMovieIds,
        ...startingMovieIds,
        ...activeMovies.filter(m => startingCardYears.has(m.year)).map(m => m.id),
      ]);
      const pool = activeMovies.filter((m) => !usedMovieIds.has(m.id));
      const nextMovie = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : activeMovies[Math.floor(Math.random() * activeMovies.length)];

      const { error: insertError } = await db.from('turns').insert({
        game_id: g.id,
        active_player_id: nextPlayer.id,
        movie_id: nextMovie.id,
        status: 'drawing',
      });
      if (insertError) {
        console.warn('[NXT] insert failed:', insertError.message, insertError.code);
        return;
      }
      await poll();
    } finally {
      nextTurnInProgress.current = false;
    }
  }

  // ── Phase renderers ──

  if (gameOver) {
    return <GameOverScreen winner={gameOver} players={players} myId={myPlayerId} />;
  }

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
    const startingPair = startingYear !== undefined ? myMoviePairs.find(p => p.year === startingYear) : undefined;
    const startingMovie = startingPair
      ? (activeMovies.find(m => m.id === startingPair.id) ?? activeMovies.find(m => m.year === startingYear) ?? null)
      : (activeMovies.find(m => m.year === startingYear) ?? null);
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

  // My own timeline (for "my timeline" modal and drawing phase display)
  const myTimeline = (players.find(p => p.id === myPlayerId)?.timeline ?? []).slice().sort((a, b) => a - b);

  // Helper: look up the correct movie for slot i in a year array, using myMoviePairs when
  // this is my own timeline (handles duplicate years like two 2025 films).
  function resolveMovie(years: number[], i: number, isMyTimeline: boolean): Movie | undefined {
    const year = years[i];
    if (isMyTimeline && myMoviePairs.length > 0) {
      const pairsForYear = myMoviePairs.filter(p => p.year === year);
      const countBefore  = years.slice(0, i).filter(y => y === year).length;
      const pair = pairsForYear[countBefore];
      if (pair) return activeMovies.find(m => m.id === pair.id);
    }
    return activeMovies.find(mv => mv.year === year);
  }

  const amIActive = currentTurn?.active_player_id === myPlayerId;

  // Active player's timeline movies — uses myMoviePairs when I'm the active player.
  const placedMovies: Movie[] = timeline
    .map((_, i) => resolveMovie(timeline, i, amIActive))
    .filter((m): m is Movie => m !== undefined);

  // My own placed movies (drawing phase) — always uses myMoviePairs.
  const myPlacedMovies: Movie[] = myTimeline
    .map((_, i) => resolveMovie(myTimeline, i, true))
    .filter((m): m is Movie => m !== undefined);

  // ── Leave game ──
  async function handleLeaveConfirmed() {
    setShowLeaveDialog(false);
    stopPolling();
    const g = game;
    const ct = currentTurnRef.current;
    try {
      if (g && ct && ct.active_player_id === myPlayerId &&
          (ct.status === 'drawing' || ct.status === 'placing')) {
        const { data: currentPlayers } = await db.from('players').select('*')
          .eq('game_id', g.id).order('created_at');
        const allPlayers = (currentPlayers ?? []) as Player[];
        const remaining = allPlayers.filter(p => p.id !== myPlayerId);
        if (remaining.length > 0) {
          const myIdx = allPlayers.findIndex(p => p.id === myPlayerId);
          const nextPlayer = remaining[myIdx % remaining.length] ?? remaining[0];
          const { data: pastTurns } = await db.from('turns').select('movie_id').eq('game_id', g.id);
          const leavePastIds = new Set<string>(pastTurns?.map((t: { movie_id: string }) => t.movie_id) ?? []);
          const leavePastYears = new Set<number>(
            [...leavePastIds]
              .map(id => activeMovies.find(m => m.id === id)?.year)
              .filter((y): y is number => y !== undefined)
          );
          const leaveStartYears = new Set<number>(
            allPlayers.flatMap(p => p.timeline ?? []).filter(year => !leavePastYears.has(year))
          );
          const usedIds = new Set<string>([
            ...leavePastIds,
            ...startingMovieIds,
            ...activeMovies.filter(m => leaveStartYears.has(m.year)).map(m => m.id),
          ]);
          const pool = activeMovies.filter(m => !usedIds.has(m.id));
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
      }
      if (myPlayerId) {
        await db.from('players').delete().eq('id', myPlayerId);
      }
    } catch (_) {
      // Best-effort — navigate away regardless.
    }
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    router.replace('/');
  }

  // ── Leave dialog — shown by back button, overlaid on every game screen ──
  const leaveModal = (
    <Modal visible={showLeaveDialog} transparent animationType="fade" onRequestClose={() => setShowLeaveDialog(false)}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowLeaveDialog(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.leaveSheet}>
          <Text style={styles.leaveTitle}>Leave game?</Text>
          <Text style={styles.leaveBody}>
            You'll be removed from the game. If it's your turn, the next player will go automatically.
          </Text>
          <View style={styles.leaveButtons}>
            <TouchableOpacity style={styles.leaveExitBtn} onPress={handleLeaveConfirmed}>
              <Text style={styles.leaveExitText}>Leave</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.leaveStayBtn} onPress={() => setShowLeaveDialog(false)}>
              <Text style={styles.leaveStayText}>Stay</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

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
                const pairsForYear = myMoviePairs.filter(p => p.year === year);
                const countBefore = myTimeline.slice(0, i).filter(y => y === year).length;
                const pair = pairsForYear[countBefore];
                const m = pair ? activeMovies.find(mv => mv.id === pair.id) : activeMovies.find(mv => mv.year === year);
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
        {leaveModal}
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
        {leaveModal}
          <View style={styles.placingTopHalf}>
            <Text style={[styles.phaseLabel, styles.placingLabel]}>Waiting for {activePlayer?.display_name}…</Text>
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
        {leaveModal}
          {/* Top half: floating animated card */}
          <View style={styles.placingTopHalf}>
            <Text style={[styles.phaseLabel, styles.placingLabel]}>
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
            {leaveModal}
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
        <SafeAreaView style={styles.guessScreenL} edges={['top', 'bottom', 'left', 'right']}>
          {leaveModal}
          {/* Header */}
          <View style={styles.guessHeaderL}>
            <Text style={styles.guessTitleL}>What year is this movie from?</Text>
            <Text style={styles.guessSubtitleL}>BONUS COIN — NAME THE MOVIE + DIRECTOR</Text>
          </View>

          {/* Main two-panel row */}
          <View style={styles.guessMainRow}>
            {/* Left: text inputs */}
            <View style={styles.guessLeftPanel}>
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
            </View>

            {/* Divider */}
            <View style={styles.guessDivider} />

            {/* Right: voice input */}
            <View style={styles.guessRightPanel}>
              {voiceState === 'idle' && (movieGuess || directorGuess) ? (
                <View style={styles.voicePreview}>
                  {movieGuess    && <Text style={styles.voicePreviewText}>🎬 {movieGuess}</Text>}
                  {directorGuess && <Text style={styles.voicePreviewText}>🎬 {directorGuess}</Text>}
                  <TouchableOpacity onPress={() => { setMovieGuess(''); setDirectorGuess(''); }}>
                    <Text style={styles.voiceRetryText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : voiceState === 'idle' ? (
                <TouchableOpacity style={styles.voiceMicBtn} onPress={startVoice} activeOpacity={0.75}>
                  <Text style={styles.voiceMicIcon}>🎤</Text>
                  <Text style={styles.voiceMicText}>Speak your answer</Text>
                </TouchableOpacity>
              ) : voiceState === 'listening' ? (
                <TouchableOpacity style={[styles.voiceMicBtn, styles.voiceMicBtnListening]} onPress={stopVoice} activeOpacity={0.75}>
                  <Text style={styles.voiceMicIcon}>🎤</Text>
                  <Text style={styles.voiceMicText}>Listening… tap to stop</Text>
                </TouchableOpacity>
              ) : voiceState === 'processing' ? (
                <View style={[styles.voiceMicBtn, { opacity: 0.7 }]}>
                  <ActivityIndicator color={C.gold} size="small" />
                  <Text style={styles.voiceMicText}>Interpreting…</Text>
                </View>
              ) : (
                <View style={styles.voiceErrorBox}>
                  <Text style={styles.voiceErrorText}>{voiceError}</Text>
                  <TouchableOpacity onPress={() => { voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceError(''); }}>
                    <Text style={styles.voiceRetryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.guessFooterL}>
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
              style={[styles.guessPlaceBtn, { flex: 2 }]}
              onPressIn={() => setReadyToPlace(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.guessPlaceText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    // ── Trailer playing ──
    return (
      <View style={styles.trailerContainer}>
        {leaveModal}
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
        {leaveModal}
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
    // For active-player wins: use their actual placed_interval (they chose the slot).
    // For challenger wins: compute where the year falls in the challenger's own timeline.
    // For trash: use placed_interval (shows where the active player put it).
    const revealInterval = (winnerPlayer && winnerId !== currentTurn.active_player_id)
      ? computeCorrectInterval(m.year, winnerTimeline)
      : currentTurn.placed_interval;

    // Phase 'flip': show ACTIVE PLAYER's current timeline with the card flipping at placed_interval
    // Phase 'result': show WINNER's current timeline (before handleNextTurn adds the new card)
    // Do NOT filter by m.year — the winner may already have another card with that same year
    const displayTimeline = revealPhase === 'flip'
      ? timeline  // active player's timeline
      : winnerTimeline;
    const displayInterval = revealPhase === 'flip'
      ? currentTurn.placed_interval
      : revealInterval;

    // Use resolveMovie so same-year slots (e.g. two 2024 films) show the correct movie.
    // When the display timeline is the winner's and the winner is me, myMoviePairs is used.
    const revealIsMyTimeline = winnerId === myPlayerId || (!winnerPlayer && amActive);
    const revealPlacedMovies: Movie[] = displayTimeline
      .map((_, i) => resolveMovie(displayTimeline, i, revealIsMyTimeline))
      .filter((mv): mv is Movie => mv !== undefined);

    // During reveal, if I'm the winner, show the new card in my timeline modal immediately
    const revealMyTimeline = (winnerId === myPlayerId && revealPhase === 'result')
      ? [...myTimeline, m.year].sort((a, b) => a - b)
      : myTimeline;
    const revealMyPlacedMovies: Movie[] = revealMyTimeline
      .map(year => activeMovies.find(mv => mv.year === year))
      .filter((mv): mv is Movie => mv !== undefined);
    const revealMyTimelineModal = (
      <Modal visible={showMyTimeline} transparent animationType="slide" onRequestClose={() => setShowMyTimeline(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowMyTimeline(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.myTimelineSheet}>
            <View style={styles.myTimelineHeader}>
              <Text style={styles.myTimelineTitle}>My Timeline</Text>
              <TouchableOpacity onPress={() => setShowMyTimeline(false)} style={styles.reportCloseBtn}>
                <Text style={styles.reportCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {revealMyTimeline.length === 0 ? (
              <Text style={styles.myTimelineEmpty}>No cards yet</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.myTimelineScroll}>
                {revealMyTimeline.map((year, i) => {
                  // The newly-won card is the last occurrence of m.year in revealMyTimeline
                  // (myMoviePairs isn't updated until handleNextTurn runs)
                  const isNewSlot = winnerId === myPlayerId && year === m.year &&
                    i === revealMyTimeline.lastIndexOf(m.year);
                  let mid: string | undefined;
                  if (isNewSlot) {
                    mid = m.id;
                  } else {
                    const pairsForYear = myMoviePairs.filter(p => p.year === year);
                    const countBefore = revealMyTimeline.slice(0, i).filter(y => y === year).length;
                    mid = pairsForYear[countBefore]?.id;
                  }
                  const mv = mid ? activeMovies.find(mv => mv.id === mid) : activeMovies.find(mv => mv.year === year);
                  return mv
                    ? <CardFront key={i} movie={mv} width={90} height={126} />
                    : <View key={i} style={styles.myTimelinePlaceholder}><Text style={styles.myTimelinePlaceholderYear}>{year}</Text></View>;
                })}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );

    return (
      <SafeAreaView style={styles.container}>
        {revealMyTimelineModal}
        {leaveModal}
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
            revealingMovie={isTrash && revealPhase === 'result' ? undefined : m}
          />
        </View>

        {/* Result strip — appears after the flip completes */}
        {revealPhase === 'result' && (
          <>
            <View style={styles.revealStrip}>
              <View style={[styles.revealStripAccent, { backgroundColor: isTrash ? C.danger : C.gold }]} />
              <ResultIcon result={activeCorrect ? 'correct' : winningChallenger ? 'challenge' : 'trash'} size={36} />
              <View style={styles.revealStripBody}>
                <Text style={styles.revealStripHeadline} numberOfLines={1}>
                  {resultName
                    ? <><Text style={styles.revealResultPlayerHL}>{resultName}</Text>{' '}{resultText}</>
                    : resultText}
                </Text>
                {winningChallenger && (
                  <Text style={styles.revealStripSub} numberOfLines={1}>
                    Card moves to {getPlayer(winningChallenger.challenger_id)?.display_name}'s timeline
                  </Text>
                )}
                {coinBackNames.length > 0 && (
                  <Text style={styles.revealStripSub} numberOfLines={1}>
                    {coinBackNames.join(', ')} also had it right
                  </Text>
                )}
                {didSubmitBonus && (
                  <Text style={styles.revealStripSub} numberOfLines={1}>
                    {gotBonusCoin ? '+1 bonus coin! Movie + director correct' : 'No bonus coin — movie or director wrong'}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.revealStripBtn} onPress={handleNextTurn} activeOpacity={0.85}>
                <Text style={styles.revealStripBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>

            {activeCorrect && <ConfettiBurst />}
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
            <Text style={styles.scoreChipCoins}>🪙 {p.coins}</Text>
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

// ── Game Over screen ──────────────────────────────────────────────────────────

function GameOverScreen({ winner, players, myId }: { winner: Player; players: Player[]; myId: string | null }) {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 120 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const sorted = [...players].sort((a, b) => b.timeline.length - a.timeline.length);
  const isMe = winner.id === myId;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.gameOverContent}>
        {/* Trophy icon */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
          <Svg width={96} height={96} viewBox="0 0 96 96">
            <Circle cx={48} cy={48} r={46} fill="rgba(245,197,24,0.12)" />
            <Circle cx={48} cy={48} r={38} fill="none" stroke="rgba(245,197,24,0.35)" strokeWidth={1.5} />
            {/* Cup body */}
            <Path d="M34 28 L62 28 L58 56 Q48 62 38 56 Z" fill="none" stroke="#f5c518" strokeWidth={3} strokeLinejoin="round" />
            {/* Handles */}
            <Path d="M34 32 Q24 32 24 42 Q24 50 34 50" fill="none" stroke="#f5c518" strokeWidth={2.5} strokeLinecap="round" />
            <Path d="M62 32 Q72 32 72 42 Q72 50 62 50" fill="none" stroke="#f5c518" strokeWidth={2.5} strokeLinecap="round" />
            {/* Base */}
            <Path d="M40 56 L38 64 L58 64 L56 56" fill="none" stroke="#f5c518" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M33 68 L63 68" stroke="#f5c518" strokeWidth={3} strokeLinecap="round" />
          </Svg>
        </Animated.View>

        <Text style={styles.gameOverLabel}>GAME OVER</Text>
        <Text style={styles.gameOverWinner}>
          {isMe ? 'You win!' : `${winner.display_name} wins!`}
        </Text>
        <Text style={styles.gameOverCards}>
          {winner.timeline.length} cards collected
        </Text>

        {/* Leaderboard */}
        <View style={styles.gameOverLeaderboard}>
          {sorted.map((p, i) => (
            <View key={p.id} style={[styles.gameOverRow, p.id === myId && styles.gameOverRowMe]}>
              <Text style={styles.gameOverRank}>{i + 1}</Text>
              <Text style={styles.gameOverPlayerName} numberOfLines={1}>{p.display_name}</Text>
              <Text style={styles.gameOverPlayerCards}>{p.timeline.length}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.gameOverFooter}>
        <TouchableOpacity style={styles.revealNextBtn} onPress={() => router.replace('/')} activeOpacity={0.85}>
          <Text style={styles.revealNextBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>

      <ConfettiBurst />
    </SafeAreaView>
  );
}

// ── Result icon ───────────────────────────────────────────────────────────────

type ResultType = 'correct' | 'challenge' | 'trash';

function ResultIcon({ result, size = 72 }: { result: ResultType; size?: number }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 150 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  const isTrash = result === 'trash';
  const color = isTrash ? '#e63946' : '#f5c518';
  const glowBg = isTrash ? 'rgba(230,57,70,0.14)' : 'rgba(245,197,24,0.14)';
  const ringColor = isTrash ? 'rgba(230,57,70,0.4)' : 'rgba(245,197,24,0.4)';

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Svg width={size} height={size} viewBox="0 0 72 72">
        <Circle cx={36} cy={36} r={34} fill={glowBg} />
        <Circle cx={36} cy={36} r={28} fill="none" stroke={ringColor} strokeWidth={1.5} />
        {result === 'correct' && (
          <Path d="M20 36 L30 47 L52 23" stroke={color} strokeWidth={4.5}
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )}
        {result === 'challenge' && (
          <>
            <Circle cx={36} cy={36} r={11} fill="none" stroke={color} strokeWidth={1.5} />
            <Circle cx={36} cy={36} r={5} fill={color} />
          </>
        )}
        {result === 'trash' && (
          <Path d="M23 23 L49 49 M49 23 L23 49" stroke={color} strokeWidth={4.5} strokeLinecap="round" />
        )}
      </Svg>
    </Animated.View>
  );
}

// ── Confetti burst (correct answer) ──────────────────────────────────────────

const CONFETTI_COLORS = ['#f5c518', '#ffffff', '#f0d060', '#ffe082', '#fff5cc', '#f5c518', '#ffffff', '#fad44b'];
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
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.borderSubtle,
  },
  // Absolutely positioned so it doesn't push the card down in landscape
  placingLabel: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
  },
  placingBottomHalf: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  floatingCardWrapper: {
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
  revealResultPlayerHL: { color: C.gold, fontWeight: '900' },
  revealStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    overflow: 'hidden',
  },
  revealStripAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
  },
  revealStripBody: { flex: 1, gap: 2 },
  revealStripHeadline: { color: C.textPrimary, fontSize: FS.base, fontWeight: '700' },
  revealStripSub: { color: C.textSub, fontSize: FS.xs },
  revealStripBtn: {
    backgroundColor: C.gold,
    borderRadius: R.btn,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  revealStripBtnText: { color: C.textOnGold, fontSize: FS.base, fontWeight: '900', letterSpacing: 0.3 },
  // Used by GameOverScreen
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

  // ── Leave dialog ──
  leaveSheet: {
    backgroundColor: C.surface,
    borderRadius: R.card,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    gap: 16,
  },
  leaveTitle: {
    color: C.textPrimary,
    fontSize: FS.lg,
    fontWeight: '900',
    textAlign: 'center',
  },
  leaveBody: {
    color: C.textSub,
    fontSize: FS.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  leaveButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  leaveExitBtn: {
    flex: 1,
    height: 48,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveExitText: {
    color: C.textSub,
    fontSize: FS.base,
    fontWeight: '600',
  },
  leaveStayBtn: {
    flex: 2,
    height: 48,
    borderRadius: R.btn,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveStayText: {
    color: C.textOnGold,
    fontSize: FS.base,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

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

  // ── Landscape guess screen (trailer ended, active player) ──
  guessScreenL: { flex: 1, backgroundColor: C.bg },
  guessHeaderL: { paddingHorizontal: 20, paddingVertical: 10, gap: 4 },
  guessTitleL: { color: C.textPrimary, fontSize: FS.lg, fontWeight: '900', letterSpacing: 0.3 },
  guessSubtitleL: { color: C.gold, fontSize: FS.xs, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase' },
  guessMainRow: { flex: 1, flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 8, gap: 16 },
  guessLeftPanel: { flex: 1.2, justifyContent: 'center', gap: 10 },
  guessDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginVertical: 8 },
  guessRightPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  guessFooterL: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
  voicePreview: {
    alignItems: 'center', gap: 6, padding: 12, borderRadius: R.md,
    backgroundColor: 'rgba(245,197,24,0.07)', borderWidth: 1, borderColor: 'rgba(245,197,24,0.3)',
  },
  voicePreviewText: { color: C.textPrimary, fontSize: FS.sm, fontWeight: '600', textAlign: 'center' },
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


  // Coin count in ScoreBar
  scoreChipCoins: { color: C.textMuted, fontSize: FS.xs, fontWeight: '600' },

  // ── Game Over ──
  gameOverContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  gameOverLabel: {
    color: C.gold,
    fontSize: FS.xs,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  gameOverWinner: {
    color: C.textPrimary,
    fontSize: FS['2xl'],
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  gameOverCards: {
    color: C.textSub,
    fontSize: FS.base,
    fontWeight: '500',
  },
  gameOverLeaderboard: {
    width: '100%',
    marginTop: 8,
    gap: 6,
  },
  gameOverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  gameOverRowMe: {
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.35)',
    backgroundColor: C.goldFaint,
  },
  gameOverRank: {
    color: C.textMuted,
    fontSize: FS.sm,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  gameOverPlayerName: {
    flex: 1,
    color: C.textPrimary,
    fontSize: FS.base,
    fontWeight: '600',
  },
  gameOverPlayerCards: {
    color: C.gold,
    fontSize: FS.base,
    fontWeight: '800',
  },
  gameOverFooter: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
});
