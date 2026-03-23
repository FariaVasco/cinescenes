import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
  TextInput,
  BackHandler,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SpeechModule, speechAvailable, useSpeechRecognitionEvent } from '@/lib/speech-recognition';
import { C, R, FS } from '@/constants/theme';
import { parseTranscript, fuzzyMatch, computeCorrectInterval, computeValidIntervals } from '@/lib/game-logic';
import { fetchRandomInsaneMovie } from '@/lib/tmdb-insane';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Challenge, Movie, Player, Turn } from '@/lib/database.types';
import { TrailerPlayer, TrailerPlayerHandle } from '@/components/TrailerPlayer';
import { Timeline, TimelineHandle } from '@/components/Timeline';
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


export default function GameScreen() {
  const router = useRouter();
  const {
    game,
    activeMovies,
    setActiveMovies,
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
  const [canSkipTrailer, setCanSkipTrailer] = useState(true);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const flyAnimX = useRef(new Animated.Value(0)).current;
  const flyAnimY = useRef(new Animated.Value(0)).current;
  const flyAnimOpacity = useRef(new Animated.Value(1)).current;
  const timelineFade = useRef(new Animated.Value(1)).current;
  const [flyVisible, setFlyVisible] = useState(false);
  const [flyStart, setFlyStart] = useState({ x: 0, y: 0 });
  const floatingCardRef = useRef<any>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const challengeWindowStart = useRef<number | null>(null);
  const revealTriggered = useRef(false);
  const nextTurnInProgress = useRef(false);
  const challengeDecisionMade = useRef(false);
  const [revealPhase, setRevealPhase] = useState<'flip' | 'result'>('flip');
  const [showChallengerTimeline, setShowChallengerTimeline] = useState(false);
  const [movieGuess, setMovieGuess] = useState('');
  const [directorGuess, setDirectorGuess] = useState('');
  const [revealLocked, setRevealLocked] = useState(true);
  // Ordered list of { year, id } pairs for MY timeline — one entry per card in insertion order.
  // Sorted by year so index i aligns with myTimeline.sort()[i].
  // Handles duplicate years (e.g. two 2024 films) correctly.
  const [myMoviePairs, setMyMoviePairs] = useState<{ year: number; id: string }[]>([]);
  // Same structure for the active player — kept in sync on all devices so challengers
  // see the correct movie for each year slot in the active player's timeline.
  const [activePlayerPairs, setActivePlayerPairs] = useState<{ year: number; id: string }[]>([]);
  // Pairs for the winning challenger's existing timeline, fetched when reveal starts.
  const [winnerPairs, setWinnerPairs] = useState<{ year: number; id: string }[]>([]);
  const [gameOver, setGameOver] = useState<Player | null>(null);
  const introShownRef = useRef(false);
  // Insane mode: current turn's movie may not be in the activeMovies store
  const [movieOverride, setMovieOverride] = useState<Movie | null>(null);
  // Cache of insane mode movies keyed by id (not in activeMovies standard pool)
  const insaneMoviesCacheRef = useRef<Map<string, Movie>>(new Map());
  // Prefetched next-turn movie promise for insane mode — started during challenging phase
  const prefetchedInsaneMovieRef = useRef<Promise<Movie> | null>(null);

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
    setShowChallengerTimeline(false);
    timelineFade.setValue(1);
    const turn = currentTurnRef.current;
    const t = setTimeout(async () => {
      if (turn) {
        const { data: cData } = await db.from('challenges').select('*').eq('turn_id', turn.id);
        if (cData) { setLocalChallenges(cData); setChallenges(cData); }
      }
      // Show result strip — timeline stays on active player's view first
      setRevealPhase('result');
    }, 1200);
    return () => clearTimeout(t);
  }, [currentTurn?.status]);

  // After the result strip appears, if a challenger won, wait 1.8 s then
  // fade the timeline over to the challenger's view so everyone can see
  // where the card lands before pressing Next.
  useEffect(() => {
    if (revealPhase !== 'result') { setShowChallengerTimeline(false); return; }
    const ct = currentTurnRef.current;
    const m = movie;
    if (!ct || !m) return;
    const validIntervals = computeValidIntervals(m.year, getActivePlayerTimeline());
    const activeCorrect = ct.placed_interval != null && validIntervals.includes(ct.placed_interval);
    if (activeCorrect) return; // active player won — no timeline switch needed
    const wc = [...challenges]
      .filter(c => c.interval_index >= 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .find(c => validIntervals.includes(c.interval_index));
    if (!wc) return; // trashed — no switch needed
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(timelineFade, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.delay(120),
      ]).start(() => {
        setShowChallengerTimeline(true);
        Animated.timing(timelineFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, 1800);
    return () => clearTimeout(t);
  }, [revealPhase]);

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
      // Poll faster during placing so observers react quickly when the active player
      // clicks "I know it!" — the placed_interval=-1 signal shows up within ~750 ms
      // instead of up to 2 s.
      const isObserverWatchingTrailer = !amActive && currentTurn?.status === 'placing';
      startPolling(isObserverWatchingTrailer ? 750 : POLL_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailerEnded, readyToPlace, myPlayerId, currentTurn?.active_player_id, currentTurn?.status, loading]);

  // Skip-trailer gate: for public games, the active player must watch at least half
  // the safe window before "I know it!" becomes tappable.
  useEffect(() => {
    if (skipTimerRef.current) { clearTimeout(skipTimerRef.current); skipTimerRef.current = null; }
    if (trailerEnded) { setCanSkipTrailer(true); return; }
    const isPublicGame = game?.visibility === 'public';
    if (!isPublicGame) { setCanSkipTrailer(true); return; }
    setCanSkipTrailer(false);
    const m = activeMovies.find((mv) => mv.id === currentTurn?.movie_id) ?? movieOverride;
    const safeStart = m?.safe_start ?? null;
    const safeEnd = m?.safe_end ?? null;
    const minMs = (safeStart !== null && safeEnd !== null)
      ? ((safeEnd - safeStart) / 2) * 1000
      : 15_000; // insane mode default (safe_start is null)
    skipTimerRef.current = setTimeout(() => setCanSkipTrailer(true), minMs);
    return () => { if (skipTimerRef.current) { clearTimeout(skipTimerRef.current); skipTimerRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailerEnded, currentTurn?.id]);

  // Fetch current turn movie from DB when not in the store (insane mode movies)
  useEffect(() => {
    const id = currentTurn?.movie_id;
    if (!id) { setMovieOverride(null); return; }
    if (activeMovies.find(m => m.id === id)) { setMovieOverride(null); return; }
    if (insaneMoviesCacheRef.current.has(id)) {
      setMovieOverride(insaneMoviesCacheRef.current.get(id)!);
      return;
    }
    db.from('movies').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (data) {
          insaneMoviesCacheRef.current.set(id, data as Movie);
          setMovieOverride(data as Movie);
        } else {
          setMovieOverride(null);
        }
      });
  }, [currentTurn?.movie_id]);

  // Insane mode prefetch: reset on new turn, then kick off next-movie fetch during challenging
  // so it's ready (or nearly ready) by the time handleNextTurn is called.
  useEffect(() => {
    prefetchedInsaneMovieRef.current = null;
  }, [currentTurn?.id]);

  useEffect(() => {
    if (currentTurn?.status !== 'challenging' || game?.game_mode !== 'insane') return;
    if (prefetchedInsaneMovieRef.current) return; // already started
    prefetchedInsaneMovieRef.current = fetchRandomInsaneMovie(db);
  }, [currentTurn?.status, currentTurn?.id]);

  // Auto-reveal: when all challengers have decided and the lock period has passed,
  // trigger reveal automatically on the active player's device after a short grace period.
  useEffect(() => {
    const amActive = myPlayerId === currentTurn?.active_player_id;
    if (currentTurn?.status !== 'challenging' || !amActive) return;
    const canReveal = !revealLocked && !challenges.some(c => c.interval_index === -1);
    if (!canReveal) return;
    const t = setTimeout(() => { handleReveal(); }, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.status, revealLocked, challenges, myPlayerId, currentTurn?.active_player_id]);

  // When reveal starts and a challenger won, fetch their existing won turns so all
  // devices can show the correct movies in the challenger's timeline without guessing.
  useEffect(() => {
    if (currentTurn?.status !== 'revealing') { setWinnerPairs([]); return; }
    const g = game;
    if (!g) return;
    const movie = activeMovies.find(m => m.id === currentTurn.movie_id) ?? movieOverride;
    if (!movie || currentTurn.placed_interval == null) return;
    const activeTL = players.find(p => p.id === currentTurn.active_player_id)?.timeline ?? [];
    const validIntervals = computeValidIntervals(movie.year, activeTL);
    const activeCorrect = validIntervals.includes(currentTurn.placed_interval);
    if (activeCorrect) return; // active player won — activePlayerPairs already correct
    const challengers = [...challenges]
      .filter(c => c.interval_index >= 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const winningChallenger = challengers.find(c => validIntervals.includes(c.interval_index));
    if (!winningChallenger) return;
    db.from('turns').select('movie_id').eq('game_id', g.id).eq('winner_id', winningChallenger.challenger_id)
      .then(({ data }) => setWinnerPairs(wonTurnsToPairs(data ?? [])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.status, currentTurn?.id]);

  // Speech recognition event handlers (must be called at component level)
  useSpeechRecognitionEvent('result', (event) => {
    // Try multiple formats: WebSpeech nested, flat array, direct property
    const results = event.results as any;
    const transcript =
      results?.[0]?.[0]?.transcript ??
      results?.[0]?.transcript ??
      event.transcript ??
      '';
    if (!transcript || voiceStateRef.current !== 'listening') return;
    voiceStateRef.current = 'idle';
    setVoiceState('idle');
    const parsed = parseTranscript(transcript);
    if (parsed) {
      setMovieGuess(parsed.movie);
      setDirectorGuess(parsed.director);
    } else {
      // No "by" found — put everything in the movie field, let user fill director
      setMovieGuess(transcript);
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

  function startPolling(intervalMs = POLL_MS) {
    stopPolling();
    pollRef.current = setInterval(poll, intervalMs);
  }

  // Converts won-turn rows into sorted {year, id} pairs — canonical way to
  // reconstruct any player's timeline movies with no year-matching heuristics.
  function wonTurnsToPairs(wonTurns: { movie_id: string }[]): { year: number; id: string }[] {
    return wonTurns
      .map(t => activeMovies.find(m => m.id === t.movie_id))
      .filter((m): m is Movie => m !== undefined)
      .sort((a, b) => a.year - b.year)
      .map(m => ({ year: m.year, id: m.id }));
  }

  // Removes a disconnected player and advances to the next turn.
  // Safe to call from multiple devices — cross-device guard prevents double-processing.
  const advanceForStalePlayer = async (stalePlayerId: string, allPlayers: Player[]) => {
    const g = game;
    const ct = currentTurnRef.current;
    if (!g || !ct) return;

    // Cross-device guard: if another device already advanced, bail out
    const { data: existingNext } = await db
      .from('turns').select('id').eq('game_id', g.id)
      .neq('status', 'complete').gt('created_at', ct.created_at).limit(1) as { data: { id: string }[] | null };
    if (existingNext && existingNext.length > 0) return;

    const remaining = allPlayers.filter(p => p.id !== stalePlayerId);
    if (remaining.length > 0) {
      const staleIdx = allPlayers.findIndex(p => p.id === stalePlayerId);
      const nextPlayer = remaining[staleIdx % remaining.length] ?? remaining[0];
      const { data: pastTurns } = await db.from('turns').select('movie_id').eq('game_id', g.id);
      const stalePastIds = new Set<string>(pastTurns?.map((t: { movie_id: string }) => t.movie_id) ?? []);
      const stalePastYears = new Set<number>(
        [...stalePastIds].map(id => activeMovies.find(m => m.id === id)?.year).filter((y): y is number => y !== undefined)
      );
      const staleStartYears = new Set<number>(
        allPlayers.flatMap(p => p.timeline ?? []).filter(year => !stalePastYears.has(year))
      );
      let staleNextMovieId: string;
      if (g.game_mode === 'insane') {
        const m = await fetchRandomInsaneMovie(db);
        staleNextMovieId = m.id;
      } else {
        const usedIds = new Set<string>([
          ...stalePastIds,
          ...startingMovieIds,
          ...activeMovies.filter(m => staleStartYears.has(m.year)).map(m => m.id),
        ]);
        const pool = activeMovies.filter(m => !usedIds.has(m.id));
        const nextMovie = pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]
          : activeMovies[Math.floor(Math.random() * activeMovies.length)];
        staleNextMovieId = nextMovie.id;
      }
      await db.from('turns').insert({
        game_id: g.id,
        active_player_id: nextPlayer.id,
        movie_id: staleNextMovieId,
        status: 'drawing',
      });
    }
    await db.from('players').delete().eq('id', stalePlayerId);
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

    // Heartbeat — fire and forget, no await so poll isn't delayed
    if (myPlayerId) {
      db.from('players').update({ last_seen: new Date().toISOString() }).eq('id', myPlayerId);
    }

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

        if (turnChanged && freshPlayers) {
          // Fetch both pair sets in parallel, then apply ALL state in one synchronous block
          // so React batches into a single render. myWonTurns re-syncs myMoviePairs in case
          // we won the previous turn but handleNextTurn didn't run on our device (e.g. another
          // device tapped Next first) — without this, myTimeline gains a new year slot but
          // myMoviePairs has no pair for it, causing a random-movie fallback.
          const fp = freshPlayers as Player[];
          const newActiveId = latestTurn.active_player_id;
          const [{ data: activeWonTurns }, { data: myWonTurns }] = await Promise.all([
            db.from('turns').select('movie_id').eq('game_id', gId).eq('winner_id', newActiveId),
            db.from('turns').select('movie_id').eq('game_id', gId).eq('winner_id', myPlayerId ?? ''),
          ]);
          setLocalTurn(latestTurn);
          setCurrentTurn(latestTurn);
          setLocalPlayers(fp);
          setPlayers(fp);
          setActivePlayerPairs(wonTurnsToPairs(activeWonTurns ?? []));
          setMyMoviePairs(wonTurnsToPairs(myWonTurns ?? []));
        } else {
          setLocalTurn(latestTurn);
          setCurrentTurn(latestTurn);
          if (!turnChanged && statusChanged && latestTurn.status === 'revealing') {
            // Refresh players on every device when the turn goes to revealing so coin
            // changes (written by handleReveal before flipping status) show up for all players.
            if (freshPlayers) { setLocalPlayers(freshPlayers as Player[]); setPlayers(freshPlayers as Player[]); }
          }
        }

        // Observer: active player tapped "I know it!" — exit the trailer view
        if (!turnChanged && placedIntervalChanged && latestTurn.placed_interval === -1
            && myPlayerId !== latestTurn.active_player_id) {
          setTrailerEnded(true);
        }

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
          challengeDecisionMade.current = false;
          setRevealPhase('flip');
          setWinnerPairs([]);
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

      // Always sync fresh player data (catches coin changes during challenging phase
      // which don't cause a turn status change and would otherwise be invisible until Next).
      if (freshPlayers && !turnChanged) {
        setLocalPlayers(freshPlayers as Player[]);
        setPlayers(freshPlayers as Player[]);
      }


      // Stale active player detection — if active player hasn't sent a heartbeat in
      // 45 s and the turn is stuck in drawing/placing, skip them automatically.
      // Uses the same cross-device guard as handleNextTurn so only one device acts.
      if (
        freshPlayers &&
        myPlayerId !== latestTurn.active_player_id &&
        (latestTurn.status === 'drawing' || latestTurn.status === 'placing')
      ) {
        const fp = freshPlayers as Player[];
        const activeP = fp.find(p => p.id === latestTurn.active_player_id);
        const staleness = activeP?.last_seen
          ? Date.now() - new Date(activeP.last_seen).getTime()
          : Infinity;
        if (staleness > 45000) {
          await advanceForStalePlayer(latestTurn.active_player_id, fp);
        }
      }

      // Auto-reveal: active player's device triggers once the challenge window settles
      if (
        latestTurn?.status === 'challenging' &&
        myPlayerId === latestTurn.active_player_id &&
        !revealTriggered.current
      ) {
        // allSettled: no one is still picking (no interval_index === -1)
        const allSettled = (cData ?? []).every((c: Challenge) => c.interval_index !== -1);
        // allDecided: every non-active player has a row, OR challenger slots are all filled
        const observers = players.filter(p => p.id !== latestTurn.active_player_id);
        const activeTL = (freshPlayers as Player[] | null)?.find(p => p.id === latestTurn.active_player_id)?.timeline ?? [];
        const maxChallengersPoll = activeTL.length;
        const challengerLimitReachedPoll = maxChallengersPoll > 0 &&
          (cData ?? []).filter((c: Challenge) => c.interval_index !== -2).length >= maxChallengersPoll;
        const allDecided = observers.length > 0 &&
          ((cData ?? []).length >= observers.length || challengerLimitReachedPoll);
        // Initialize window if not set (e.g. fresh load into an already-challenging turn)
        if (challengeWindowStart.current === null) {
          challengeWindowStart.current = (allDecided && allSettled) ? Date.now() - 14000 : Date.now();
        }
        const elapsed = Date.now() - challengeWindowStart.current;
        // Reveal immediately once every observer has decided and none are still picking.
        // Fallback: 6.5 s after placement (handles disconnected players).
        // Hard cutoff: 15 s.
        if ((allDecided && allSettled) || (elapsed > 6500 && allSettled) || elapsed > 15000) {
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

    const activePlayerId = loadedTurn?.active_player_id ?? null;

    const [{ data: myWonTurns }, { data: activeWonTurns }] = await Promise.all([
      db.from('turns').select('movie_id').eq('game_id', g.id).eq('winner_id', myPlayerId ?? ''),
      activePlayerId
        ? db.from('turns').select('movie_id').eq('game_id', g.id).eq('winner_id', activePlayerId)
        : Promise.resolve({ data: [] }),
    ]) as [{ data: { movie_id: string }[] | null }, { data: { movie_id: string }[] | null }];

    setMyMoviePairs(wonTurnsToPairs(myWonTurns ?? []));
    setActivePlayerPairs(wonTurnsToPairs(activeWonTurns ?? []));

    // Insane mode: hydrate activeMovies with any referenced movies not yet in the store
    const allWonIds = [...new Set([...(myWonTurns ?? []), ...(activeWonTurns ?? [])].map(t => t.movie_id))];
    const missingIds = allWonIds.filter(id => !activeMovies.find(m => m.id === id));
    if (missingIds.length > 0) {
      const { data: missing } = await db.from('movies').select('*').in('id', missingIds) as { data: Movie[] | null };
      if (missing?.length) setActiveMovies([...activeMovies, ...missing]);
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
  function getMovie() { return activeMovies.find((m) => m.id === currentTurn?.movie_id) ?? movieOverride; }
  function getActivePlayerTimeline(): number[] { return getActivePlayer()?.timeline ?? []; }

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
    if (challengeDecisionMade.current) return;
    challengeDecisionMade.current = true;
    setHasPassed(false);
    // Challenging always costs 1 coin — optimistic update first, then persist
    const challenger = players.find(p => p.id === myPlayerId);
    if (challenger && challenger.coins > 0) {
      const updatedCoins = challenger.coins - 1;
      const newPlayers = players.map(p => p.id === myPlayerId ? { ...p, coins: updatedCoins } : p);
      setLocalPlayers(newPlayers);
      setPlayers(newPlayers);
      await db.from('players').update({ coins: updatedCoins }).eq('id', myPlayerId);
    }
    const { data: inserted } = await db
      .from('challenges')
      .insert({ turn_id: currentTurn.id, challenger_id: myPlayerId!, interval_index: -1 })
      .select().single() as { data: Challenge | null };
    if (inserted) setMyChallenge(inserted);
  }

  async function handlePass() {
    if (challengeDecisionMade.current) return;
    challengeDecisionMade.current = true;
    setHasPassed(true);
    if (!currentTurn) return;
    const { data: inserted } = await db
      .from('challenges')
      .insert({ turn_id: currentTurn.id, challenger_id: myPlayerId!, interval_index: -2 })
      .select().single() as { data: Challenge | null };
    if (inserted) setMyChallenge(inserted);
  }

  async function handleConfirmChallengeInterval() {
    if (!myChallenge || challengeInterval === null) return;
    await db.from('challenges').update({ interval_index: challengeInterval }).eq('id', myChallenge.id);
    setMyChallenge({ ...myChallenge, interval_index: challengeInterval });
    setChallengeConfirmed(true);
  }

  async function handleWithdrawChallenge() {
    if (!myChallenge) return;
    // Refund the coin that was deducted when Challenge was tapped
    const me = players.find(p => p.id === myPlayerId);
    if (me) {
      const refunded = me.coins + 1;
      await db.from('players').update({ coins: refunded }).eq('id', myPlayerId);
      const newPlayers = players.map(p => p.id === myPlayerId ? { ...p, coins: refunded } : p);
      setLocalPlayers(newPlayers);
      setPlayers(newPlayers);
    }
    // Set interval_index: -3 (withdrawn) — keeps the row so ordering is preserved
    await db.from('challenges').update({ interval_index: -3 }).eq('id', myChallenge.id);
    const updated = { ...myChallenge, interval_index: -3 };
    setMyChallenge(updated);
    const newChallenges = challenges.map(c => c.id === myChallenge.id ? updated : c);
    setLocalChallenges(newChallenges);
    setChallenges(newChallenges);
    setChallengeInterval(null);
  }

  async function handleAnimatedConfirm() {
    const measureCard = (): Promise<{ pageX: number; pageY: number } | null> =>
      new Promise((resolve) => {
        if (!floatingCardRef.current) { resolve(null); return; }
        const timer = setTimeout(() => resolve(null), 200);
        floatingCardRef.current.measure(
          (_: number, __: number, _w: number, _h: number, pageX: number, pageY: number) => {
            clearTimeout(timer);
            resolve({ pageX, pageY });
          },
        );
      });

    const [cardPos, gapPos] = await Promise.all([
      measureCard(),
      timelineRef.current?.measureGap() ?? null,
    ]);

    if (cardPos && gapPos) {
      flyAnimX.setValue(0);
      flyAnimY.setValue(0);
      flyAnimOpacity.setValue(1);
      setFlyStart({ x: cardPos.pageX, y: cardPos.pageY });
      setFlyVisible(true);
      cardAnimOpacity.setValue(0);

      await new Promise<void>((resolve) => {
        Animated.parallel([
          Animated.timing(flyAnimX, {
            toValue: gapPos.pageX - cardPos.pageX,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(flyAnimY, {
            toValue: gapPos.pageY - cardPos.pageY,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(580),
            Animated.timing(flyAnimOpacity, { toValue: 0, duration: 70, useNativeDriver: true }),
          ]),
        ]).start(() => resolve());
      });

      setFlyVisible(false);
    } else {
      // Fallback: card falls away
      await new Promise<void>((resolve) => {
        Animated.parallel([
          Animated.timing(cardAnimY, { toValue: 260, duration: 380, useNativeDriver: true }),
          Animated.timing(cardAnimScale, { toValue: 0.3, duration: 380, useNativeDriver: true }),
          Animated.timing(cardAnimOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => resolve());
      });
      cardAnimY.setValue(0);
      cardAnimScale.setValue(1);
      cardAnimOpacity.setValue(1);
    }

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
          const titleOK = fuzzyMatch(movieGuess, m.title);
          const directorOK = fuzzyMatch(directorGuess, m.director ?? '');
          if (titleOK && directorOK) {
            const myPlayer = players.find(p => p.id === myPlayerId);
            if (myPlayer) {
              const updatedCoins = myPlayer.coins + 1;
              await db.from('players').update({ coins: updatedCoins }).eq('id', myPlayerId);
              const newPlayers = players.map(p => p.id === myPlayerId ? { ...p, coins: updatedCoins } : p);
              setLocalPlayers(newPlayers);
              setPlayers(newPlayers);
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
    // Retire unvalidated insane-mode movies so they won't be re-dealt
    await db.from('movies')
      .update({ scan_status: 'unusable' })
      .eq('id', currentTurn.movie_id)
      .eq('scan_status', 'unvalidated');
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

      let movie = activeMovies.find((m) => m.id === ct.movie_id) ?? null;
      if (!movie) {
        // Not in cache (e.g. insane mode movie) — fetch from DB
        const { data: dbMovie } = await db.from('movies').select('*').eq('id', ct.movie_id).single();
        movie = dbMovie ?? null;
      }
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
      const activeChallengersSorted = [...challenges]
        .filter(c => c.interval_index >= 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const winningChallenger = activeCorrect
        ? null
        : activeChallengersSorted.find(c => validIntervals.includes(c.interval_index));

      let winnerId: string | null = null;
      if (activeCorrect) winnerId = ct.active_player_id;
      else if (winningChallenger) winnerId = winningChallenger.challenger_id;

      // Write winner_id on the current turn so every device can later reconstruct
      // exact player→movie mappings without ambiguity (same-year collisions).
      // Safe to run on all devices — idempotent same-value writes.
      if (winnerId) {
        await db.from('turns').update({ winner_id: winnerId }).eq('id', ct.id);
      }

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

      // Refund coins for challengers who placed at a valid interval but didn't win the card.
      // Runs on the single device that passes the cross-device guard — no race condition.
      // Cases: (1) active player correct AND challenger also valid (same-year duplicate);
      //        (2) an earlier challenger wins AND a later one also had a valid interval.
      let playersAfterRefunds = latestPlayers;
      for (const c of challenges) {
        if (c.interval_index < 0) continue; // passed / withdrew / unpicked
        if (c.challenger_id === winnerId) continue; // winner keeps their coin
        const shouldRefund =
          (activeCorrect && validIntervals.includes(c.interval_index)) ||
          (winnerId && winnerId !== ct.active_player_id && validIntervals.includes(c.interval_index));
        if (shouldRefund) {
          const p = playersAfterRefunds.find(pl => pl.id === c.challenger_id);
          if (p) {
            const refunded = p.coins + 1;
            await db.from('players').update({ coins: refunded }).eq('id', c.challenger_id);
            playersAfterRefunds = playersAfterRefunds.map(pl => pl.id === c.challenger_id ? { ...pl, coins: refunded } : pl);
          }
        }
      }

      let updatedPlayers = playersAfterRefunds;
      if (winnerId) {
        const winner = playersAfterRefunds.find(p => p.id === winnerId) ?? null;
        if (winner) {
          const newTimeline = [...winner.timeline, movie.year].sort((a, b) => a - b);
          await db.from('players').update({ timeline: newTimeline }).eq('id', winnerId);
          // Keep updatedPlayers for nextPlayer calculation only — don't push to state here.
          // poll() will re-fetch players when it detects the new turn, ensuring the drawing
          // phase gets the correct timeline without the reveal phase ever seeing it early.
          updatedPlayers = playersAfterRefunds.map(p => p.id === winnerId ? { ...p, timeline: newTimeline } : p);

          // Game over — winner reached the target card count
          if (newTimeline.length >= WIN_CARDS) {
            await db.from('games').update({ status: 'finished' }).eq('id', g.id);
            setLocalPlayers(updatedPlayers);
            setPlayers(updatedPlayers);
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
      let nextMovieId: string;
      if (g.game_mode === 'insane') {
        const m = await (prefetchedInsaneMovieRef.current ?? fetchRandomInsaneMovie(db));
        prefetchedInsaneMovieRef.current = null;
        insaneMoviesCacheRef.current.set(m.id, m);
        setActiveMovies([...activeMovies, m]);
        nextMovieId = m.id;
      } else {
        const usedMovieIds = new Set<string>([
          ...pastTurnMovieIds,
          ...startingMovieIds,
          ...activeMovies.filter(m => startingCardYears.has(m.year)).map(m => m.id),
        ]);
        const pool = activeMovies.filter((m) => !usedMovieIds.has(m.id));
        const nextMovie = pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]
          : activeMovies[Math.floor(Math.random() * activeMovies.length)];
        nextMovieId = nextMovie.id;
      }

      const { error: insertError } = await db.from('turns').insert({
        game_id: g.id,
        active_player_id: nextPlayer.id,
        movie_id: nextMovieId,
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#f5c518" />
        </View>
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

  // Helper: look up the correct movie for slot i in a year array using the given pairs
  // (handles duplicate years like two 2025 films). Pass myMoviePairs for own timeline,
  // activePlayerPairs for the active player's timeline viewed as observer, or [] for fallback.
  function resolveMovie(years: number[], i: number, pairs: { year: number; id: string }[]): Movie | undefined {
    const cache = insaneMoviesCacheRef.current;
    const year = years[i];
    if (pairs.length > 0) {
      const pairsForYear = pairs.filter(p => p.year === year);
      const countBefore  = years.slice(0, i).filter(y => y === year).length;
      const pair = pairsForYear[countBefore];
      if (pair) return activeMovies.find(m => m.id === pair.id) ?? cache.get(pair.id);
    }
    return activeMovies.find(mv => mv.year === year);
  }

  const amIActive = currentTurn?.active_player_id === myPlayerId;

  // Active player's timeline movies.
  // On the active player's device: use myMoviePairs (authoritative).
  // On challenger devices: use activePlayerPairs (synced at turn start) so the
  // correct movie is shown even when multiple movies share the same year.
  const placedMovies: Movie[] = timeline.map((year, i) => {
    const cache = insaneMoviesCacheRef.current;
    if (amIActive && myMoviePairs.length > 0) {
      const pairsForYear = myMoviePairs.filter(p => p.year === year);
      const countBefore = timeline.slice(0, i).filter(y => y === year).length;
      const pair = pairsForYear[countBefore];
      if (pair) return activeMovies.find(m => m.id === pair.id) ?? cache.get(pair.id);
    } else if (!amIActive && activePlayerPairs.length > 0) {
      const pairsForYear = activePlayerPairs.filter(p => p.year === year);
      const countBefore = timeline.slice(0, i).filter(y => y === year).length;
      const pair = pairsForYear[countBefore];
      if (pair) return activeMovies.find(m => m.id === pair.id) ?? cache.get(pair.id);
    }
    return activeMovies.find(mv => mv.year === year);
  }).filter((m): m is Movie => m !== undefined);

  // My own placed movies (drawing phase) — always uses myMoviePairs.
  const myPlacedMovies: Movie[] = myTimeline
    .map((_, i) => resolveMovie(myTimeline, i, myMoviePairs))
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
          let leaveNextMovieId: string;
          if (g.game_mode === 'insane') {
            const m = await fetchRandomInsaneMovie(db);
            leaveNextMovieId = m.id;
          } else {
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
            leaveNextMovieId = nextMovie.id;
          }
          await db.from('turns').insert({
            game_id: g.id,
            active_player_id: nextPlayer.id,
            movie_id: leaveNextMovieId,
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
    router.replace('/local-lobby');
  }

  // ── Leave dialog — absolute overlay instead of Modal to preserve landscape lock on iOS ──
  const leaveModal = showLeaveDialog ? (
    <TouchableOpacity style={[StyleSheet.absoluteFill, styles.modalBackdrop]} activeOpacity={1} onPress={() => setShowLeaveDialog(false)}>
      <View style={styles.leaveSheet} onStartShouldSetResponder={() => true}>
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
      </View>
    </TouchableOpacity>
  ) : null;

  // ── "My Timeline" overlay — absolute instead of Modal to preserve landscape lock on iOS ──
  const myTimelineModal = showMyTimeline ? (
    <TouchableOpacity style={[StyleSheet.absoluteFill, styles.modalBackdrop]} activeOpacity={1} onPress={() => setShowMyTimeline(false)}>
      <View style={styles.myTimelineSheet} onStartShouldSetResponder={() => true}>
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
      </View>
    </TouchableOpacity>
  ) : null;

  // ── DRAWING ──
  if (currentTurn.status === 'drawing') {
    const drawingTimeline = amActive ? myTimeline : timeline;
    const drawingPlacedMovies = amActive ? myPlacedMovies : placedMovies;
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1 }}>
          {/* ── Active player's timeline — main section ── */}
          <View style={styles.drawingTopSection}>
            <Text style={styles.drawingTurnLabel}>
              {amActive ? 'Your turn' : `${activePlayer?.display_name}'s timeline`}
            </Text>
            {movie && drawingTimeline.length > 0 && (
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
          </View>

          {/* ── CTA ── */}
          <View style={styles.drawingCTAArea}>
            {amActive ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleLetsDraw}>
                <Text style={styles.primaryBtnText}>Let's Guess 🎬</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.drawingWaitingText}>{activePlayer?.display_name} is thinking…</Text>
            )}
          </View>

          {/* ── Observer's own timeline ── */}
          {!amActive && myTimeline.length > 0 && (
            <View style={styles.drawingMySection}>
              <Text style={styles.drawingMySectionLabel}>Your timeline</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.drawingMyScroll}
              >
                {myTimeline.map((year, i) => {
                  const mv = resolveMovie(myTimeline, i, myMoviePairs);
                  return mv
                    ? <CardFront key={i} movie={mv} width={52} height={70} />
                    : <View key={i} style={styles.myTimelinePlaceholder}><Text style={styles.myTimelinePlaceholderYear}>{year}</Text></View>;
                })}
              </ScrollView>
            </View>
          )}
        </View>

        <ScoreBar players={players} myId={myPlayerId} />
        {leaveModal}
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
          <View style={styles.gameArea}>
            <View style={styles.timelineArea}>
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
            <View style={styles.leftOverlay}>
              <Text style={[styles.phaseLabel, styles.placingLabel]}>Waiting for {activePlayer?.display_name}…</Text>
              <CardBack width={80} height={CARD_H} />
            </View>
          </View>
          <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
          {myTimelineModal}
          {leaveModal}
        </SafeAreaView>
      );
    }

    // ── Timeline (after trailer + ready) ──
    if (readyToPlace) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.gameArea}>
            <View style={styles.timelineArea}>
              <Timeline
                ref={timelineRef}
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
            <View style={styles.leftOverlay}>
              <Text style={[styles.phaseLabel, styles.placingLabel]}>
                {amActive ? 'Where does it go?' : `Waiting for ${activePlayer?.display_name}…`}
              </Text>
              {amActive && selectedInterval === null && (
                <Text style={styles.tapHint}>Tap + to pick a spot</Text>
              )}
              <Animated.View
                ref={floatingCardRef}
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

          <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
          {flyVisible && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Animated.View
                style={{
                  position: 'absolute',
                  left: flyStart.x,
                  top: flyStart.y,
                  transform: [{ translateX: flyAnimX }, { translateY: flyAnimY }],
                  opacity: flyAnimOpacity,
                }}
              >
                <CardBack width={80} height={CARD_H} />
              </Animated.View>
            </View>
          )}
          {myTimelineModal}
          {leaveModal}
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
            {leaveModal}
          </View>
        );
      }

      return (
        <SafeAreaView style={styles.guessScreen} edges={['top', 'bottom', 'left', 'right']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Header */}
            <View style={styles.guessHeader}>
              <Text style={styles.guessTitle}>What year is this movie from?</Text>
              <Text style={styles.guessSubtitle}>BONUS COIN — NAME THE MOVIE + DIRECTOR</Text>
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
                {speechAvailable ? (
                  voiceState === 'idle' ? (
                    <TouchableOpacity style={styles.voiceMicBtn} onPress={startVoice} activeOpacity={0.75}>
                      <Text style={styles.voiceMicIcon}>🎤</Text>
                      <Text style={styles.voiceMicText}>Say "[movie] by [director]"</Text>
                    </TouchableOpacity>
                  ) : voiceState === 'listening' ? (
                    <TouchableOpacity style={[styles.voiceMicBtn, styles.voiceMicBtnListening]} onPress={stopVoice} activeOpacity={0.75}>
                      <Text style={styles.voiceMicIcon}>🎤</Text>
                      <Text style={styles.voiceMicText}>Listening… tap to stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.voiceErrorBox}>
                      <Text style={styles.voiceErrorText}>{voiceError}</Text>
                      <TouchableOpacity onPress={() => { voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceError(''); }}>
                        <Text style={styles.voiceRetryText}>Try again</Text>
                      </TouchableOpacity>
                    </View>
                  )
                ) : (
                  <Text style={styles.voiceUnavailableText}>Type your answer on the left</Text>
                )}
              </View>
            </View>

            {/* Footer */}
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
                style={[styles.guessPlaceBtn, { flex: 2 }]}
                onPressIn={() => setReadyToPlace(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.guessPlaceText}>Place it →</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
          {leaveModal}
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
                style={[styles.skipButton, !canSkipTrailer && styles.skipButtonDisabled]}
                disabled={!canSkipTrailer}
                onPress={async () => {
                  trailerRef.current?.stop();
                  setUserPaused(false);
                  // Signal observers first (awaited so they can poll it before we advance)
                  if (currentTurn) {
                    const optimistic = { ...currentTurn, placed_interval: -1 };
                    currentTurnRef.current = optimistic;
                    setLocalTurn(optimistic);
                    await db.from('turns').update({ placed_interval: -1 }).eq('id', currentTurn.id);
                  }
                  setTrailerEnded(true);
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

        {/* Report overlay — absolute layer instead of Modal to avoid WebView/UIKit crash on iOS */}
        {showReportDialog && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.modalBackdrop]}
            activeOpacity={1}
            onPress={() => { setShowReportDialog(false); trailerRef.current?.resume(); }}
          >
            <View style={styles.reportSheet} onStartShouldSetResponder={() => true}>
              <View style={styles.reportHeader}>
                <Text style={styles.reportTitle}>What's wrong?</Text>
                <TouchableOpacity onPress={() => { setShowReportDialog(false); trailerRef.current?.resume(); }} style={styles.reportCloseBtn}>
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
            </View>
          </TouchableOpacity>
        )}

        <Snackbar
          visible={snackMessage.length > 0}
          onDismiss={() => setSnackMessage('')}
          duration={3500}
          style={styles.snack}
          theme={{ colors: { inverseSurface: '#1e1630', inverseOnSurface: '#fff', inversePrimary: '#f5c518' } }}
        >
          {snackMessage}
        </Snackbar>
        {leaveModal}
      </View>
    );
  }

  // ── CHALLENGING ──
  if (currentTurn.status === 'challenging') {
    if (!movie) return <LoadingScreen />;

    const observers = players.filter(p => p.id !== currentTurn.active_player_id);

    // Challengers (non-passes, non-withdrawn) sorted by challenge creation time
    const seqChallengers = [...challenges]
      .filter(c => c.interval_index !== -2)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Max challengers = intervals available to challengers (total intervals - 1 for active player)
    const maxChallengers = timeline.length;
    const challengerLimitReached = maxChallengers > 0 && seqChallengers.length >= maxChallengers;

    // allDecided: everyone decided OR challenger slots are all filled
    const allDecided = observers.length > 0 &&
      (challenges.length >= observers.length || challengerLimitReached);

    const currentPickerChallenge = seqChallengers.find(c => c.interval_index === -1);
    const currentPicker = currentPickerChallenge
      ? players.find(p => p.id === currentPickerChallenge.challenger_id) : null;

    const amFirstChallenger = seqChallengers[0]?.challenger_id === myPlayerId;
    const isMyTurnToPick = currentPickerChallenge?.challenger_id === myPlayerId;
    const inSeqPhase = allDecided && seqChallengers.length > 0;

    const alreadyDecided = hasPassed || myChallenge !== null;

    const canChallenge = !challengerLimitReached && timeline.length > 0;

    const pendingChallengers = challenges.some(c => c.interval_index === -1);
    const canRevealNow = !revealLocked && !pendingChallengers;
    const myPlayerObj = players.find(p => p.id === myPlayerId);
    const hasCoins = (myPlayerObj?.coins ?? 0) > 0;

    // Picking: only when it's my turn in the sequential phase and I haven't confirmed yet
    const isPickingInterval = !amActive && isMyTurnToPick && !challengeConfirmed;

    // Blocked intervals: already-picked slots + active player's placement
    const pickedIntervals = seqChallengers
      .filter(c => c.interval_index >= 0)
      .map(c => c.interval_index);
    const blockedIntervals = [...pickedIntervals, currentTurn.placed_interval].filter((x): x is number => x != null);

    // Confirmed challenger placements — rendered as coins on the shared timeline
    const challengerPlacements = challenges
      .filter(c => c.interval_index >= 0)
      .map(c => ({
        interval: c.interval_index,
        label: getPlayer(c.challenger_id)?.display_name ?? '?',
      }));

    // Left-panel status
    let statusMsg: string;
    let statusEmoji: string;
    if (isPickingInterval) {
      statusMsg = 'Tap a gap to\nplace your coin';
      statusEmoji = '🪙';
    } else if (inSeqPhase && currentPicker) {
      statusMsg = isMyTurnToPick ? 'Tap a gap to\nplace your coin' : `Waiting for\n${currentPicker.display_name}…`;
      statusEmoji = isMyTurnToPick ? '🪙' : '🤔';
    } else if (inSeqPhase && !pendingChallengers) {
      const names = seqChallengers.filter(c => c.interval_index >= 0).map(c => getPlayer(c.challenger_id)?.display_name ?? '?').join(', ');
      statusMsg = names ? `${names} challenged!` : 'Waiting for\neveryone…';
      statusEmoji = names ? '🎯' : '⏳';
    } else {
      statusMsg = 'Waiting for\neveryone…';
      statusEmoji = '⏳';
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gameArea}>
          <View style={styles.timelineArea}>
            <Timeline
              timeline={timeline}
              currentCardMovie={movie}
              interactive={isPickingInterval}
              selectedInterval={isPickingInterval ? challengeInterval : null}
              onIntervalSelect={isPickingInterval ? setChallengeInterval : () => {}}
              onConfirm={isPickingInterval ? handleConfirmChallengeInterval : () => {}}
              placedInterval={currentTurn.placed_interval}
              placedLabel={amActive ? 'your pick' : 'their pick'}
              placedMovies={placedMovies}
              challengerPlacements={challengerPlacements}
              blockedIntervals={isPickingInterval ? blockedIntervals : undefined}
              hideFloatingCard
            />
          </View>
          <View style={styles.leftOverlay}>
            <View style={styles.challengeStatusArea}>
              <Text style={styles.challengeOverlayIcon}>{statusEmoji}</Text>
              <Text style={styles.challengeOverlayText}>{statusMsg}</Text>
            </View>
            {isPickingInterval && (
              <Text style={styles.challengePickTitle}>Tap + to place your coin</Text>
            )}
            {/* Decision phase — not yet decided */}
            {!amActive && !alreadyDecided && !inSeqPhase && (
              <View style={styles.challengeActionsArea}>
                <ChallengeTimer seconds={10} onExpire={handlePass} barMode />
                {canChallenge ? (
                  <>
                    <TouchableOpacity
                      style={[styles.challengePillV, !hasCoins && { opacity: 0.35 }]}
                      onPress={hasCoins ? handleChallenge : undefined}
                      activeOpacity={hasCoins ? 0.75 : 1}
                    >
                      <Text style={styles.challengePillText}>{hasCoins ? 'Challenge' : 'No coins'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.passPillV} onPress={handlePass} activeOpacity={0.75}>
                      <Text style={styles.passPillText}>Pass</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.passPillV} onPress={handlePass} activeOpacity={0.75}>
                    <Text style={styles.passPillText}>All spots taken</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {/* Decision phase — challenged, waiting for others */}
            {!amActive && !inSeqPhase && myChallenge?.interval_index === -1 && (
              <Text style={styles.challengeOverlayText}>You challenged!{'\n'}Waiting for others…</Text>
            )}
            {/* Sequential phase — withdraw button (2nd+ challengers only) */}
            {isPickingInterval && !amFirstChallenger && (
              <TouchableOpacity style={styles.passPillV} onPress={handleWithdrawChallenge} activeOpacity={0.75}>
                <Text style={styles.passPillText}>↩ Withdraw</Text>
              </TouchableOpacity>
            )}
            {/* Sequential phase — already picked */}
            {!amActive && inSeqPhase && myChallenge !== null && myChallenge.interval_index >= 0 && !isPickingInterval && (
              <Text style={styles.challengeOverlayText}>Coin placed.{'\n'}Waiting for others…</Text>
            )}
            {/* Sequential phase — withdrawn */}
            {!amActive && myChallenge?.interval_index === -3 && (
              <Text style={styles.challengeOverlayText}>You withdrew.</Text>
            )}
            {amActive && (
              <TouchableOpacity
                style={[styles.revealNowBtn, !canRevealNow && { opacity: 0.35 }]}
                onPress={canRevealNow ? handleReveal : undefined}
                activeOpacity={canRevealNow ? 0.85 : 1}
              >
                <Text style={styles.revealNowBtnText}>
                  {revealLocked ? 'Waiting…' : pendingChallengers ? 'Deciding…' : 'Reveal →'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
        {myTimelineModal}
        {leaveModal}
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
    const revealChallengersSorted = [...challenges]
      .filter(c => c.interval_index >= 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const winningChallenger = activeCorrect
      ? null
      : revealChallengersSorted.find(c => validIntervals.includes(c.interval_index));
    const coinBackChallengers = (validIntervals.length === 2 && activeCorrect)
      ? challenges.filter(
          (c) =>
            c.interval_index >= 0 &&
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

    // During flip: active player's timeline + placed_interval
    // During result before switch: still active player's timeline (so everyone sees the wrong placement)
    // After showChallengerTimeline: winner's timeline at the correct interval
    const showWinnerView = revealPhase === 'result' && (showChallengerTimeline || activeCorrect);
    const displayTimeline = showWinnerView ? winnerTimeline : timeline;
    const displayInterval = showWinnerView ? revealInterval : currentTurn.placed_interval;

    // Pick the right pairs for resolveMovie depending on whose timeline is shown:
    // - My own timeline → myMoviePairs (authoritative)
    // - Active player's timeline viewed as observer → activePlayerPairs (synced at turn start)
    // - Challenger winner's timeline → no pairs available, fall back to first-by-year
    const revealIsMyTimeline = showWinnerView
      ? (winnerId === myPlayerId || (!winnerPlayer && amActive))
      : amActive;
    const revealPairs = revealIsMyTimeline
      ? myMoviePairs
      : (!showWinnerView || activeCorrect) ? activePlayerPairs : winnerPairs;
    const revealPlacedMovies: Movie[] = displayTimeline
      .map((_, i) => resolveMovie(displayTimeline, i, revealPairs))
      .filter((mv): mv is Movie => mv !== undefined);

    // During reveal, if I'm the winner, show the new card in my timeline modal immediately
    const revealMyTimeline = (winnerId === myPlayerId && revealPhase === 'result')
      ? [...myTimeline, m.year].sort((a, b) => a - b)
      : myTimeline;
    const revealMyTimelineModal = showMyTimeline ? (
      <TouchableOpacity style={[StyleSheet.absoluteFill, styles.modalBackdrop]} activeOpacity={1} onPress={() => setShowMyTimeline(false)}>
        <View style={styles.myTimelineSheet} onStartShouldSetResponder={() => true}>
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
        </View>
      </TouchableOpacity>
    ) : null;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gameArea}>
          <Animated.View style={[styles.timelineArea, { opacity: timelineFade }]}>
            <Timeline
              timeline={displayTimeline}
              currentCardMovie={m}
              interactive={false}
              selectedInterval={null}
              onIntervalSelect={() => {}}
              onConfirm={() => {}}
              placedInterval={displayInterval}
              placedLabel={amActive ? 'your pick' : 'their pick'}
              placedMovies={revealPlacedMovies}
              revealingMovie={m}
              insertDelay={showChallengerTimeline ? 700 : undefined}
              trashAfter={isTrash && revealPhase === 'result' ? 1000 : undefined}
            />
          </Animated.View>
          <Animated.View style={[styles.leftOverlay, { opacity: timelineFade }]}>
            {showChallengerTimeline && winnerPlayer && (
              <Text style={styles.revealTimelineOwner}>
                {winnerPlayer.display_name}'s timeline
              </Text>
            )}
          </Animated.View>
          {revealPhase === 'result' && (
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
          )}
        </View>
        {winnerId === myPlayerId && revealPhase === 'result' && <ConfettiBurst />}
        <ScoreBar players={players} myId={myPlayerId} onShowTimeline={() => setShowMyTimeline(true)} />
        {revealMyTimelineModal}
        {leaveModal}
      </SafeAreaView>
    );
  }

  return <LoadingScreen />;
}

function ScoreBar({ players, myId, onShowTimeline, myTimelineHint }: { players: Player[]; myId: string | null; onShowTimeline?: () => void; myTimelineHint?: boolean }) {
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
          {myTimelineHint && <Text style={styles.myTimelineHintLabel}>My timeline</Text>}
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#f5c518" />
      </View>
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
      <View style={styles.gameOverLayout}>

        {/* ── Left panel: trophy + winner info + button ── */}
        <View style={styles.gameOverLeft}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
            <Svg width={64} height={64} viewBox="0 0 96 96">
              <Circle cx={48} cy={48} r={46} fill="rgba(245,197,24,0.12)" />
              <Circle cx={48} cy={48} r={38} fill="none" stroke="rgba(245,197,24,0.35)" strokeWidth={1.5} />
              <Path d="M34 28 L62 28 L58 56 Q48 62 38 56 Z" fill="none" stroke="#f5c518" strokeWidth={3} strokeLinejoin="round" />
              <Path d="M34 32 Q24 32 24 42 Q24 50 34 50" fill="none" stroke="#f5c518" strokeWidth={2.5} strokeLinecap="round" />
              <Path d="M62 32 Q72 32 72 42 Q72 50 62 50" fill="none" stroke="#f5c518" strokeWidth={2.5} strokeLinecap="round" />
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

          <TouchableOpacity style={[styles.revealNextBtn, { marginTop: 8, alignSelf: 'stretch' }]} onPress={() => router.replace('/local-lobby')} activeOpacity={0.85}>
            <Text style={styles.revealNextBtnText}>Back to Lobby</Text>
          </TouchableOpacity>
        </View>

        {/* ── Right panel: leaderboard ── */}
        <View style={styles.gameOverRight}>
          <ScrollView contentContainerStyle={styles.gameOverLeaderboard} showsVerticalScrollIndicator={false}>
            {sorted.map((p, i) => (
              <View key={p.id} style={[styles.gameOverRow, p.id === myId && styles.gameOverRowMe]}>
                <Text style={styles.gameOverRank}>{i + 1}</Text>
                <Text style={styles.gameOverPlayerName} numberOfLines={1}>{p.display_name}</Text>
                <Text style={styles.gameOverPlayerCards}>{p.timeline.length}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

      </View>
      {isMe && <ConfettiBurst />}
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
// Two corner cannons (top-left + top-right) firing in a fan arc.
// Particles follow a gravity curve: shoot outward + up, then fall down.
// A quick golden screen flash lands on the beat.

const CONFETTI_COLORS = [
  '#f5c518', '#f5c518', '#f5c518', // gold — dominant
  '#ffffff', '#ffffff',             // white
  '#ffd700', '#ffe082', '#fff3a0', // warm golds
  '#e63946',                        // accent red
];
const PER_CANNON = 22;

function ConfettiBurst() {
  const flashAnim = useRef(new Animated.Value(0)).current;

  const particles = useRef(
    Array.from({ length: PER_CANNON * 2 }, (_, i) => {
      const fromRight = i >= PER_CANNON;
      const frac = (i % PER_CANNON) / (PER_CANNON - 1);

      // Left cannon fires rightward arc: -55° to +65° from horizontal
      // Right cannon fires leftward arc: 115° to 235° from horizontal
      const spreadRad = (120 / 180) * Math.PI;
      const baseAngle = fromRight
        ? (115 / 180) * Math.PI + frac * spreadRad
        : (-55 / 180) * Math.PI + frac * spreadRad;
      const angle = baseAngle + (Math.random() - 0.5) * 0.18;

      const speed = 110 + Math.random() * 200;
      const isStrip = Math.random() < 0.55;
      const gravity = 260 + Math.random() * 140;

      return {
        anim: new Animated.Value(0),
        fromRight,
        // x travels linearly; y is initial arc + gravity fall
        dx: Math.cos(angle) * speed,
        dyMid: Math.sin(angle) * speed,          // at t=0.45 (peak)
        dyEnd: Math.sin(angle) * speed + gravity, // at t=1.0 (fallen)
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        w: isStrip ? 2.5 + Math.random() * 2 : 5 + Math.random() * 4,
        h: isStrip ? 11 + Math.random() * 9  : 5 + Math.random() * 4,
        spins: (Math.random() - 0.5) * 7,
        delay: Math.floor(Math.random() * 90),
      };
    })
  ).current;

  useEffect(() => {
    // Golden screen flash on the beat
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0.15, duration: 100, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0,    duration: 380, useNativeDriver: true }),
    ]).start();

    // Stagger particles slightly so they feel organic
    Animated.stagger(
      10,
      particles.map(p =>
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(p.anim, {
            toValue: 1,
            duration: 1050 + Math.random() * 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ])
      )
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Screen flash */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#f5c518', opacity: flashAnim }]}
      />

      {particles.map((p, i) => {
        const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const ty = p.anim.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0, p.dyMid, p.dyEnd],
        });
        const opacity = p.anim.interpolate({
          inputRange: [0, 0.5, 0.88, 1],
          outputRange: [1, 1, 0.6, 0],
        });
        const rotate = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.spins * 360}deg`],
        });
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
  // True once flip + reveal is fully complete — shows the start button + countdown
  const [readyToStart, setReadyToStart] = useState(false);
  const [countdown, setCountdown] = useState(10);

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
        canDismiss.current = true;
        setReadyToStart(true);
      });
    });
  }, [started]);

  useEffect(() => {
    if (!readyToStart) return;
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [readyToStart]);

  useEffect(() => {
    if (countdown === 0 && readyToStart) onDone();
  }, [countdown]);

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
        <View style={{ flex: 1 }}>
          <SafeAreaView style={introStyles.inner} edges={['top', 'bottom']}>

            <View style={introStyles.header}>
              <Text style={introStyles.headline}>Your starting card</Text>
              <Text style={introStyles.subtext}>Draw from the deck, {playerName}</Text>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
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
            </View>

            <Animated.View style={[introStyles.footer, { opacity: tapHintOpacity }]}>
              {startingMovie && (
                <View style={introStyles.miniTimeline}>
                  <View style={introStyles.miniGap} />
                  <CardFront movie={startingMovie} width={56} height={78} />
                  <View style={introStyles.miniGap} />
                </View>
              )}
              <Text style={introStyles.addedLabel}>Added to your timeline</Text>
              <TouchableOpacity style={introStyles.startBtn} onPress={onDone} activeOpacity={0.8}>
                <Text style={introStyles.startBtnText}>Let's start playing! 🎬</Text>
              </TouchableOpacity>
              <Text style={introStyles.countdownText}>Auto-starting in {countdown}s</Text>
            </Animated.View>

          </SafeAreaView>
        </View>
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
    gap: 10,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FS.sm,
    fontWeight: '500',
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
    color: C.textMuted,
    fontSize: FS.sm,
    fontWeight: '500',
  },
  startBtn: {
    backgroundColor: C.gold,
    borderRadius: R.btn,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  startBtnText: {
    color: C.textOnGold,
    fontSize: FS.base,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  countdownText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: FS.xs,
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

  // ── Drawing phase ──
  drawingTopSection: {
    paddingTop: 16,
  },
  drawingTurnLabel: {
    color: C.gold,
    fontSize: FS.xs,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.8,
    marginBottom: 2,
  },
  drawingCTAArea: {
    paddingHorizontal: 32,
    paddingVertical: 18,
    alignItems: 'center',
  },
  drawingWaitingText: {
    color: C.textSub,
    fontSize: FS.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  drawingMySection: {
    maxHeight: 110,
    paddingTop: 4,
  },
  drawingMySectionLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: FS.micro,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  drawingMyScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },

  phaseCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, paddingHorizontal: 40 },
  bigTurnText: { color: C.textPrimary, fontSize: FS['2xl'], fontWeight: '900', textAlign: 'center' },
  waitingText: { color: C.textSub, fontSize: FS.lg, textAlign: 'center' },
  timelineOwnerLabel: { color: C.textSub, fontSize: FS.sm, textAlign: 'center', marginBottom: 4 },
  avatarLarge: {
    width: 72, height: 72, borderRadius: R.full,
    backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
  },
  avatarLargeText: { color: C.textOnGold, fontSize: FS.xl, fontWeight: '900' },
  primaryBtn: { backgroundColor: C.gold, borderRadius: R.btn, paddingHorizontal: 32, paddingVertical: 14 },
  primaryBtnText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '900' },
  phaseLabel: { color: C.textSub, fontSize: FS.base, fontWeight: '600', textAlign: 'center' },
  tapHint: { color: C.textMuted, fontSize: FS.sm, textAlign: 'center', marginTop: 4 },

  gameArea: {
    flex: 1,
    position: 'relative',
  },
  timelineArea: {
    flex: 1,
    marginLeft: 120,
    justifyContent: 'center',
  },
  leftOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: C.borderSubtle,
    backgroundColor: C.bg,
  },
  placingLabel: {
    textAlign: 'center',
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

  challengeStatusArea: {
    alignItems: 'center',
    gap: 6,
  },
  challengeActionsArea: {
    width: '100%',
    gap: 20,
  },
  challengeOverlayIcon: { fontSize: 24 },
  challengeOverlayText: {
    color: C.textSub,
    fontSize: FS.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  challengePillV: {
    width: '100%',
    borderRadius: R.btn,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(230,57,70,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(230,57,70,0.5)',
  },
  challengePillText: {
    color: '#e63946',
    fontSize: FS.sm,
    fontWeight: '700',
  },
  passPillV: {
    width: '100%',
    borderRadius: R.btn,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  passPillText: {
    color: C.textSub,
    fontSize: FS.sm,
    fontWeight: '600',
  },
  challengePickTitle: {
    color: C.textMuted,
    fontSize: FS.xs,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  passBtnText: { color: C.textSub, fontSize: FS.sm, fontWeight: '600' },
  revealNowBtn: {
    width: '100%',
    borderRadius: R.btn,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  revealNowBtnText: { color: C.textOnGold, fontSize: FS.sm, fontWeight: '900' },

  // ── Revealing phase ──
  revealTimelineOwner: {
    color: C.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 0.85,
    paddingBottom: 4,
  },
  revealResultPlayerHL: { color: C.gold, fontWeight: '900' },
  revealStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
  skipButtonDisabled: { opacity: 0.4 },
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
  myTimelineHintLabel: { color: C.textSub, fontSize: 9, textAlign: 'center', marginBottom: 3 },

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
  guessScreen: { flex: 1, backgroundColor: C.bg },
  guessHeader: { paddingHorizontal: 20, paddingVertical: 10, gap: 4 },
  guessTitle: { color: C.textPrimary, fontSize: FS.lg, fontWeight: '900', letterSpacing: 0.3 },
  guessSubtitle: { color: C.gold, fontSize: FS.xs, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase' },
  guessMainRow: { flex: 1, flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 8, gap: 16 },
  guessLeftPanel: { flex: 1.2, justifyContent: 'center', gap: 10 },
  guessDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginVertical: 8 },
  guessRightPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  guessFooter: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
  voiceMicBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: R.card,
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
  voiceUnavailableText: {
    color: C.textMuted, fontSize: FS.sm, textAlign: 'center',
  },
  guessReplayBtn: {
    flex: 1, height: 52, borderRadius: R.card,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  guessReplayText: { color: C.textSub, fontSize: FS.base, fontWeight: '600' },
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
  gameOverLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  gameOverLeft: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  gameOverRight: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  gameOverLabel: {
    color: C.gold,
    fontSize: FS.xs,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  gameOverWinner: {
    color: C.textPrimary,
    fontSize: FS.xl,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  gameOverCards: {
    color: C.textSub,
    fontSize: FS.sm,
    fontWeight: '500',
  },
  gameOverLeaderboard: {
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
});
