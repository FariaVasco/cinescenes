import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  View,
  Text,
  Image,
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
  Keyboard,
  PanResponder,
  Settings,
} from 'react-native';
import { useAudioRecorder, useAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { transcribeAudio } from '@/lib/whisper';
import { C, R, FS, Fonts } from '@/constants/theme';
import { scanTranscript, phoneticMatch, fuzzyMatch, computeCorrectInterval, computeValidIntervals } from '@/lib/game-logic';
import { llmExtractGuess } from '@/lib/llm-voice';
import { fetchRandomInsaneMovie, searchDirector } from '@/lib/tmdb-insane';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Challenge, Movie, Player, Turn } from '@/lib/database.types';
import { TrailerPlayer, TrailerPlayerHandle, TITLE_CARD_BURN } from '@/components/TrailerPlayer';
import { Timeline, TimelineHandle } from '@/components/Timeline';
import * as haptics from '@/lib/haptics';
import { ChallengeTimer } from '@/components/ChallengeTimer';
import { HourglassTimer, TrailerCountdown } from '@/components/AnimatedHourglass';
import { CardBack, CardFront } from '@/components/MovieCard';
import Svg, { Circle, Path } from 'react-native-svg';
import { AirPlayButton, useAirPlayAvailable } from 'airplay-picker';
import { TVSession } from 'tv-session';
import { CloseIcon, PlayIcon, CastToTVIcon, ArrowLeftIcon } from '@/components/CinemaIcons';
import { CinescenesMark } from '@/components/CinescenesMark';
import FilmCountdown from '@/components/FilmCountdown';
import { BetRevealOverlay } from '@/components/BetRevealOverlay';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import { FadePauseOverlay } from '@/components/FadePauseOverlay';
import { BrandedLoader, ChoosingMovieLabel } from '@/components/GameLoaders';
import { GameIntroScreen } from '@/components/GameIntroScreen';

const log = __DEV__ ? console.log : () => {};

const lcTrophy        = require('../assets/lc-trophy.png');
const lcDirectorsChair = require('../assets/lc-directors-chair.png');
const lcPopcorn       = require('../assets/lc-popcorn.png');
const lcLightning     = require('../assets/lc-lightning.png');
const lcStarburst     = require('../assets/lc-starburst.png');
const lcFilmReel      = require('../assets/lc-film-reel.png');
const lcHourglass     = require('../assets/lc-hourglass.png');
const lcCoin          = require('../assets/lc-coin.png');

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
const PREVIEW_DURATION = 6000; // ms — timeline study countdown before trailer reveals

// Returns the platform to use when filtering the movie pool for the next turn.
// Local: only the host's device plays the trailer → use host's platform (players[0]).

const EXTRA_SUSPENSE_MS = 1500;

export default function GameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const timelinePaddingBottom = Math.max(80, 78 + insets.top - insets.bottom);
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
    tvMode, setTvMode,
    gameJustStarted, setGameJustStarted,
  } = useAppStore();

  const [players, setLocalPlayers] = useState<Player[]>(storePlayers);
  const [currentTurn, setLocalTurn] = useState<Turn | null>(null);
  const [challenges, setLocalChallenges] = useState<Challenge[]>([]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [trailerEnded, setTrailerEnded] = useState(false);
  const [trailerRevealed, setTrailerRevealed] = useState(false);
  const [countdownDone, setCountdownDone] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [canSkipTrailer, setCanSkipTrailer] = useState(true);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [readyToPlace, setReadyToPlace] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hasReplayed, setHasReplayed] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');
  const [loading, setLoading] = useState(true);
  // Initialised from the store so the very first render already shows the countdown
  // for new games — no BrandedLoader flash before the countdown appears.
  const [showCountdown, setShowCountdown] = useState(() => useAppStore.getState().gameJustStarted);
  const [showIntro, setShowIntro] = useState(false);
  const [trailerKey, setTrailerKey] = useState(0);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [castVisible, setCastVisible] = useState(false);
  const [tvBannerDismissed, setTvBannerDismissed] = useState(false);
  const airPlayAvailable = useAirPlayAvailable();
  const [bonusPanelOpen, setBonusPanelOpen] = useState(false);

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
  const challengerTransitionOpacity = useRef(new Animated.Value(0)).current;
  const challengePanelY = useRef(new Animated.Value(200)).current;
  const leftPanelFade = useRef(new Animated.Value(1)).current;
  const bonusPanelAnim = useRef(new Animated.Value(0)).current;
  // "Lights on" transition: dark overlay that fades away when drawing phase appears after reveal
  const lightsOnAnim = useRef(new Animated.Value(0)).current;
  // Cross-fade between countdown overlay and trailer overlay
  const trailerRevealAnim = useRef(new Animated.Value(0)).current;
  const countdownFadeAnim = useRef(new Animated.Value(1)).current;
  const prevStatusRef = useRef<string | null>(null);
  const [flyVisible, setFlyVisible] = useState(false);
  const [flyStart, setFlyStart] = useState({ x: 0, y: 0 });
  const floatingCardRef = useRef<any>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const challengeWindowStart = useRef<number | null>(null);
  const revealTriggered = useRef(false);
  const nextTurnInProgress = useRef(false);
  const [nextTurnPending, setNextTurnPending] = useState(false);
  const challengeDecisionMade = useRef(false);
  // Mirrors challengeConfirmed state for use inside poll closures (state is stale in closures).
  const challengeConfirmedRef = useRef(false);
  // Mirrors myChallenge state so timer callbacks can read it without stale closures.
  const myChallengeRef = useRef<Challenge | null>(null);
  // Set to true while a local turn/placement write is in-flight so the poll doesn't
  // overwrite our optimistic state with stale DB data before the write lands.
  const pendingTurnWrite = useRef(false);
  // Floor for myTimeline: set when we win a card so the interval poll can't briefly
  // show a timeline missing the just-won card while the DB write is still in-flight.
  const myTimelineFloorRef = useRef<number[] | null>(null);
  // Tracks previous placed_interval so the host can detect a non-null→null reset (= replay request).
  const prevPlacedIntervalRef = useRef<number | null | undefined>(undefined);
  // Prevents the challenger-timeline transition from being armed more than once per result phase.
  const challengerSwitchArmed = useRef(false);
  // Timer refs for the challenger-timeline switch — stored in refs so that poll-driven
  // challenges updates (same data, new array reference) cannot cancel them via effect cleanup.
  const challengerSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const challengerSwitchInnerTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [showBetReveal, setShowBetReveal] = useState(false);
  const [betRevealCount, setBetRevealCount] = useState(0);
  const betRevealTriggered = useRef(false);
  const betRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revealPhase, setRevealPhase] = useState<'suspense' | 'flip' | 'result'>('suspense');
  const [revealBgDark, setRevealBgDark] = useState(false);
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
  const showIntroRef  = useRef(false);
  // Insane mode: current turn's movie may not be in the activeMovies store
  const [movieOverride, setMovieOverride] = useState<Movie | null>(null);
  // Cache of insane mode movies keyed by id (not in activeMovies classic pool)
  const insaneMoviesCacheRef = useRef<Map<string, Movie>>(new Map());
  // Prefetched next-turn movie promise for insane mode — started during challenging phase
  const prefetchedInsaneMovieRef = useRef<Promise<Movie> | null>(null);
  // Prefetched past-turn movie_ids for standard/collection modes — started during challenging
  // so the dedup set is ready at next-turn time (saves a ~200-400ms round-trip).
  const prefetchedPastTurnsRef = useRef<Promise<{ data: { movie_id: string }[] | null }> | null>(null);

  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'processing' | 'result' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState('');
  const [voiceResult, setVoiceResult] = useState<{ movie: string; director: string } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const voiceStateRef = useRef<'idle' | 'recording' | 'processing' | 'result' | 'error'>('idle');
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const revealSound = useAudioPlayer(require('../assets/sounds/reveal.mp3'));
  const winSound       = useAudioPlayer(require('../assets/sounds/win.mp3'));
  const challengeSound = useAudioPlayer(require('../assets/sounds/challenge.mp3'));
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformBars = useRef(Array.from({ length: 30 }, () => new Animated.Value(0.07))).current;
  const waveformHistory = useRef<number[]>(Array(30).fill(0.07));

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so the interval always has the latest values
  const currentTurnRef = useRef<Turn | null>(null);
  const gameIdRef = useRef<string | null>(null);

  // Whole game is landscape from intro through play.
  useEffect(() => {
    showIntroRef.current = showIntro;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, [loading, showIntro]);

  useEffect(() => {
    if (!game) { router.replace('/'); return; }
    gameIdRef.current = game.id;
    if (Platform.OS === 'ios') Settings.set({ 'com.cinescenes.tvGameId': game.id });
    // Clear the store flag now that the countdown has started
    if (useAppStore.getState().gameJustStarted) setGameJustStarted(false);
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

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Fade the "lights on" overlay from opaque → transparent when the placing phase appears after reveal.
  // The setValue(1) happens synchronously in the render body so the first painted frame is already dark.
  useEffect(() => {
    if (currentTurn?.status !== 'placing') return;
    Animated.timing(lightsOnAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
    return () => lightsOnAnim.stopAnimation();
  }, [currentTurn?.status]);

  // Cross-fade: snap to trailer the moment both gates open.
  useEffect(() => {
    if (!countdownDone || !trailerRevealed) return;
    Animated.parallel([
      Animated.timing(countdownFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(trailerRevealAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [countdownDone, trailerRevealed]);

  // Non-video devices (non-host in private game) never receive onRevealed from TrailerPlayer
  // since TrailerPlayer is not rendered for them. Manually open the gate when countdown fires.
  useEffect(() => {
    if (!countdownDone) return;
    const amHost_ = players.length > 0 && players[0].id === myPlayerId;
    const showVideo_ = amHost_ || game?.visibility === 'public';
    if (!showVideo_) setTrailerRevealed(true);
  }, [countdownDone]);

  // Suspense → flip → result reveal sequence.
  // Challenges are fetched immediately (for the suspense overlay).
  // Phase timeline: 0ms suspense, 2400ms flip (card visible+flipping), 3800ms result (panel slides up).
  useEffect(() => {
    if (currentTurn?.status !== 'revealing') return;
    setRevealPhase('suspense');
    setRevealBgDark(false);
    setShowChallengerTimeline(false);
    timelineFade.setValue(1);
    challengerTransitionOpacity.setValue(0);
    const turn = currentTurnRef.current;
    // Play challenge sting immediately using already-loaded challenges state
    const hasChallengers = challenges.some(c => c.interval_index !== -2);
    if (hasChallengers) {
      try { challengeSound.seekTo(0); challengeSound.play(); } catch {}
    }
    // Fetch fresh challenges for the suspense overlay UI
    if (turn) {
      (async () => {
        const { data: cData } = await db.from('challenges').select('*').eq('turn_id', turn.id);
        if (cData) {
          setLocalChallenges(cData);
          setChallenges(cData);
        }
      })();
    }
    const t1 = setTimeout(() => { setRevealPhase('flip'); try { revealSound.seekTo(0); revealSound.play(); } catch {} }, 3400 + EXTRA_SUSPENSE_MS);
    const t2 = setTimeout(() => setRevealPhase('result'), 4800 + EXTRA_SUSPENSE_MS);
    // Switch to dark bg when overlay starts fading out — invisible under the overlay,
    // so when it completes the dark timeline is already visible underneath.
    const tBg = setTimeout(() => setRevealBgDark(true), 2900 + EXTRA_SUSPENSE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(tBg); };
  }, [currentTurn?.status]);

  // Per-device reveal haptic: fire success/error only if THIS player participated.
  // Active player → result based on placement. Challenger → result based on their pick.
  // Passers / observers feel nothing — haptic is feedback for their own bet.
  useEffect(() => {
    if (revealPhase !== 'result') return;
    const ct = currentTurnRef.current;
    const m = movie;
    if (!ct || !m || ct.placed_interval == null) return;
    const validIntervals = computeValidIntervals(m.year, getActivePlayerTimeline());
    const activeCorrect = validIntervals.includes(ct.placed_interval);
    const amActiveLocal = myPlayerId === ct.active_player_id;
    if (amActiveLocal) {
      activeCorrect ? haptics.success() : haptics.error();
      return;
    }
    const mine = challenges.find(c => c.challenger_id === myPlayerId);
    if (!mine || mine.interval_index < 0) return; // passed / withdrew
    const iWon = !activeCorrect && validIntervals.includes(mine.interval_index);
    iWon ? haptics.success() : haptics.error();
  }, [revealPhase]);

  // After the result strip appears and the card drifts away from the active player's
  // timeline, transition to the challenger's timeline with a named overlay so everyone
  // knows whose timeline they're about to see.
  // Effect 1: reset when the reveal phase leaves 'result'. Cancels any in-flight timers
  // via refs so they are not affected by the arm-effect's dependency on `challenges`.
  useEffect(() => {
    if (revealPhase === 'result') return;
    if (challengerSwitchTimerRef.current) {
      clearTimeout(challengerSwitchTimerRef.current);
      challengerSwitchTimerRef.current = null;
    }
    challengerSwitchInnerTimersRef.current.forEach(clearTimeout);
    challengerSwitchInnerTimersRef.current = [];
    setShowChallengerTimeline(false);
    challengerTransitionOpacity.setValue(0);
    challengerSwitchArmed.current = false;
  }, [revealPhase]);

  // Effect 2: arm the challenger-timeline switch once a winning challenger is confirmed.
  // `challenges` is included so the effect re-fires if challenges arrive after revealPhase
  // becomes 'result'. Timers are stored in refs (not in a closure cleanup) so that
  // subsequent poll-driven challenges updates — which always produce a new array reference
  // even when data is unchanged — cannot cancel them via effect cleanup.
  useEffect(() => {
    if (revealPhase !== 'result') return;
    if (challengerSwitchArmed.current) return; // timer already running, don't restart
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
    if (!wc) return; // trashed or challenges not yet loaded — re-fires when challenges arrive
    challengerSwitchArmed.current = true;
    // Wait for the card drift animation to finish (trashAfter=1200 + 700ms fly = 1900ms),
    // then show challenger name overlay, then cross-fade to their timeline.
    challengerSwitchTimerRef.current = setTimeout(() => {
      challengerSwitchTimerRef.current = null;
      // Fade out active player's timeline
      Animated.timing(timelineFade, { toValue: 0, duration: 450, useNativeDriver: true }).start();
      // 150ms into fade-out: challenger name fades in
      challengerSwitchInnerTimersRef.current.push(setTimeout(() => {
        Animated.timing(challengerTransitionOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      }, 150));
      // 1100ms later: name fades out, switch to challenger timeline, fade in
      challengerSwitchInnerTimersRef.current.push(setTimeout(() => {
        Animated.timing(challengerTransitionOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
        setShowChallengerTimeline(true);
        Animated.timing(timelineFade, { toValue: 1, duration: 550, useNativeDriver: true }).start();
      }, 1100));
    }, 1950);
    // No cleanup return — timers live in refs and are cancelled only by Effect 1 above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealPhase, challenges]);

  // Bet-reveal animation: counts up betRevealCount once per participant, then calls handleReveal()
  useEffect(() => {
    if (!showBetReveal) return;
    const ct = currentTurnRef.current;
    if (!ct) return;
    // Participants: active player + all finalised challenge rows (sorted by created_at)
    const finalised = [...challenges]
      .filter(c => c.interval_index !== -1)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const total = 1 + finalised.length; // active player + challengers/passers
    let count = 0;
    const tick = () => {
      count++;
      setBetRevealCount(count);
      if (count < total) {
        betRevealTimerRef.current = setTimeout(tick, 1100);
      } else {
        // All revealed — brief pause then flip the card (active player only)
        betRevealTimerRef.current = setTimeout(() => {
          if (isActivePlayer()) handleReveal();
        }, 1400);
      }
    };
    // Initial pause: let "All bets are in!" sink in
    betRevealTimerRef.current = setTimeout(tick, 1000);
    return () => { if (betRevealTimerRef.current) { clearTimeout(betRevealTimerRef.current); betRevealTimerRef.current = null; } };
  }, [showBetReveal]);

  useEffect(() => { challengeConfirmedRef.current = challengeConfirmed; }, [challengeConfirmed]);
  useEffect(() => { myChallengeRef.current = myChallenge; }, [myChallenge]);

  // Lock the Reveal button for 5.5 s after challenging starts
  // (gives everyone the challenge window + buffer before reveal is allowed)
  useEffect(() => {
    if (currentTurn?.status !== 'challenging') { setRevealLocked(true); return; }
    setRevealLocked(true);
    // Reset bet-reveal refs each time a new challenging phase starts so a stuck ref
    // from the previous round (race condition: handleNextTurn updates currentTurnRef
    // before the poll's turnChanged block fires) doesn't block the fast-path trigger.
    betRevealTriggered.current = false;
    revealTriggered.current = false;
    challengeWindowStart.current = null;
    challengePanelY.setValue(200);
    Animated.spring(challengePanelY, { toValue: 0, damping: 30, stiffness: 160, useNativeDriver: true }).start();
    const t = setTimeout(() => setRevealLocked(false), 5500);
    return () => clearTimeout(t);
  }, [currentTurn?.id, currentTurn?.status]);

  // Non-host exits the intro screen when the host writes placing_started_at
  useEffect(() => {
    if (showIntro && currentTurn?.placing_started_at) {
      setShowIntro(false);
    }
  }, [currentTurn?.placing_started_at, showIntro]);

  // Pause polling while the active player is typing on the guess screen.
  // Without this, the 2-second poll triggers state updates → KeyboardAvoidingView
  // recalculates layout (causing visible glitching) and disrupts speech recognition.
  useEffect(() => {
    const amActive = myPlayerId === currentTurn?.active_player_id;
    const amHost = players.length > 0 && players[0].id === myPlayerId;
    if (trailerEnded && !readyToPlace && amActive) {
      setReadyToPlace(true); // skip guess screen — panel lives on placement screen
      // Private games: only the host plays the trailer. When the host is ALSO the active
      // player, branch 3 below never fires, so we still need to write placed_interval=-1
      // here so non-host observers exit the "is watching the trailer" overlay and start
      // seeing the active player's timeline.
      if (amHost && game?.visibility !== 'public' && currentTurn?.placed_interval === null) {
        db.from('turns').update({ placed_interval: -1 }).eq('id', currentTurn!.id);
      }
    } else if (!trailerEnded && !readyToPlace && amActive && !amHost
        && game?.visibility !== 'public'
        && currentTurn?.placed_interval === -1) {
      // Host's trailer ended and they wrote placed_interval=-1; advance the active
      // non-host player to the placing screen without them pressing "I know it!".
      setTrailerEnded(true);
    } else if (trailerEnded && !readyToPlace && !amActive && amHost
        && game?.visibility !== 'public'
        && currentTurn?.placed_interval === null) {
      // Host's trailer ended but it's not their turn in a private game.
      // Write placed_interval=-1 so the active player's poll unblocks them.
      db.from('turns').update({ placed_interval: -1 }).eq('id', currentTurn!.id);
    } else if (!loading) {
      // Poll faster during placing (observer reacts to "I know it!") and during
      // challenging (all devices see allDecided within ~750 ms instead of up to 2 s).
      const isObserverWatchingTrailer = !amActive && currentTurn?.status === 'placing';
      const isChallengingPhase = currentTurn?.status === 'challenging';
      startPolling(isObserverWatchingTrailer || isChallengingPhase ? 750 : POLL_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailerEnded, readyToPlace, myPlayerId, currentTurn?.active_player_id, currentTurn?.status, currentTurn?.placed_interval, loading]);

  // Host-side: detect when the active player (non-host, private game) resets placed_interval
  // back to null after it was set — that's the signal that they want a replay.
  useEffect(() => {
    const curr = currentTurn?.placed_interval ?? null;
    const prev = prevPlacedIntervalRef.current;
    prevPlacedIntervalRef.current = curr;
    const isHost = players.length > 0 && players[0].id === myPlayerId;
    const isActive = myPlayerId === currentTurn?.active_player_id;
    // Only act if: host, not their turn, private game, trailer already ended on host,
    // and placed_interval just went from non-null back to null (= replay request).
    if (isHost && !isActive && game?.visibility !== 'public'
        && trailerEnded && prev !== undefined && prev !== null && curr === null) {
      setTrailerEnded(false);
      setTrailerRevealed(false);
      setUserPaused(false);
      setVideoStarted(false);
      trailerRevealAnim.setValue(0);
      countdownFadeAnim.setValue(1);
      setTrailerKey(k => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.placed_interval]);

  // When the app returns from background during trailer playback the WebView freezes.
  // Force-remount the player so it loads fresh — the title burn hides the restart.
  const wasBackgroundedRef = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive') {
        wasBackgroundedRef.current = true;
      } else if (nextState === 'active' && wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        if (currentTurn?.status === 'placing' && !trailerEnded) {
          setTrailerEnded(false);
          setTrailerRevealed(false);
          setCountdownDone(false);
          setVideoStarted(false);
          trailerRevealAnim.setValue(0);
          countdownFadeAnim.setValue(1);
          setTrailerKey(k => k + 1);
        }
      }
    });
    return () => sub.remove();
  }, [currentTurn?.status, trailerEnded]);

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
  }, [trailerEnded, currentTurn?.id, game?.visibility]);

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
      .then(({ data }: { data: Movie | null }) => {
        if (data) {
          insaneMoviesCacheRef.current.set(id, data);
          setMovieOverride(data);
        } else {
          setMovieOverride(null);
        }
      });
  }, [currentTurn?.movie_id]);

  // Next-turn prefetch: reset on new turn, then kick off next-move data during challenging
  // so it's ready (or nearly ready) by the time handleNextTurn is called.
  useEffect(() => {
    prefetchedInsaneMovieRef.current = null;
    prefetchedPastTurnsRef.current = null;
    leftPanelFade.setValue(1);
  }, [currentTurn?.id]);

  useEffect(() => {
    if (currentTurn?.status !== 'challenging' || !game) return;
    if (game.game_mode === 'insane') {
      if (prefetchedInsaneMovieRef.current) return;
      prefetchedInsaneMovieRef.current = fetchRandomInsaneMovie(db, game.trailer_platform ?? 'ios');
    } else {
      if (prefetchedPastTurnsRef.current) return;
      prefetchedPastTurnsRef.current = db.from('turns').select('movie_id').eq('game_id', game.id) as unknown as Promise<{ data: { movie_id: string }[] | null }>;
    }
  }, [currentTurn?.status, currentTurn?.id, game?.game_mode, game?.id]);

  // Auto-reveal: start bet-reveal sequence only once all decisions are confirmed in local state.
  // Does NOT fire on lock-expiry alone — that was racy (challenge row may not have arrived via poll yet).
  // Timed fallbacks (10s soft / 60s hard) are handled by the poll.
  useEffect(() => {
    const amActive = myPlayerId === currentTurn?.active_player_id;
    if (currentTurn?.status !== 'challenging' || !amActive) return;
    if (betRevealTriggered.current) return;
    const noPendingPickers = !challenges.some(c => c.interval_index === -1);
    const observers = players.filter(p => p.id !== currentTurn.active_player_id);
    const everybodyIn = observers.length > 0 && challenges.length >= observers.length && noPendingPickers;
    if (!everybodyIn) return;
    revealTriggered.current = true;
    betRevealTriggered.current = true;
    setShowBetReveal(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.status, challenges, players, myPlayerId, currentTurn?.active_player_id]);

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
      .then(({ data }: { data: { movie_id: string }[] | null }) => setWinnerPairs(wonTurnsToPairs(data ?? [])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.status, currentTurn?.id]);


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
      db.from('players').select('*').eq('game_id', gId).is('left_at', null).order('created_at'),
    ]);

    // Heartbeat — fire and forget, no await so poll isn't delayed
    // Only runs after intro is done so last_seen=null reliably means "hasn't spun yet".
    // .then(() => {}) forces the Supabase v2 lazy query to actually execute.
    if (myPlayerId && introShownRef.current) {
      db.from('players').update({ last_seen: new Date().toISOString() }).eq('id', myPlayerId).then(() => {});
    }

    if (gameRow?.status === 'finished') {
      const fp = (freshPlayers ?? []) as Player[];
      const winner = fp.reduce((best: Player | null, p) =>
        !best || p.timeline.length > best.timeline.length ? p : best, null);
      if (winner) {
        setLocalPlayers(fp);
        setPlayers(fp);
        setGameOver(winner);
        if (winner.id === myPlayerId) { haptics.success(); try { winSound.seekTo(0); winSound.play(); } catch {} } else { haptics.warning(); }
        stopPolling();
      }
      return;
    }

    // During the intro (spinning wheel) refresh players every tick so all devices
    // see who has written last_seen and the host's "ready" list stays current.
    // Preserve any locally-optimistic last_seen: if the DB row still shows null but
    // local state already has a value (write in-flight), keep the local value so the
    // UI doesn't flicker back to "Spinning" while waiting for the round-trip.
    if (showIntroRef.current && freshPlayers) {
      setLocalPlayers(prev => (freshPlayers as Player[]).map(fp => {
        const local = prev.find(p => p.id === fp.id);
        return (local?.last_seen && !fp.last_seen) ? local : fp;
      }));
      setPlayers(freshPlayers as Player[]);
    }

    if (latestTurn) {
      const prevTurn = currentTurnRef.current;
      const turnChanged = !prevTurn || prevTurn.id !== latestTurn.id;
      const statusChanged = prevTurn?.status !== latestTurn.status;
      const placedIntervalChanged = prevTurn?.placed_interval !== latestTurn.placed_interval;

      // If a local write is in-flight, skip overwriting our optimistic turn state
      // with stale DB data. The next poll (after the write lands) will catch up.
      const placingStartedAtChanged = prevTurn?.placing_started_at !== latestTurn.placing_started_at;
      const shouldUpdateTurn = !pendingTurnWrite.current
        ? (turnChanged || statusChanged || placedIntervalChanged || placingStartedAtChanged)
        : turnChanged; // only allow cross-turn updates while pending

      if (shouldUpdateTurn) {
        currentTurnRef.current = latestTurn;

        if (turnChanged && freshPlayers) {
          // Await pair queries BEFORE flipping the phase so the first drawing-phase
          // paint renders with correct placedMovies — no stale-timeline flash when
          // two movies share a year.
          const fp = freshPlayers as Player[];
          const newActiveId = latestTurn.active_player_id;
          const [{ data: activeWonTurns }, { data: myWonTurns }] = await Promise.all([
            db.from('turns').select('movie_id').eq('game_id', gId).eq('winner_id', newActiveId),
            db.from('turns').select('movie_id').eq('game_id', gId).eq('winner_id', myPlayerId ?? ''),
          ]) as [{ data: { movie_id: string }[] | null }, { data: { movie_id: string }[] | null }];
          // Hydrate any referenced movies not yet in the store (insane mode).
          const allWonIds = [...new Set([
            ...(activeWonTurns ?? []),
            ...(myWonTurns ?? []),
          ].map(t => t.movie_id))];
          const missingIds = allWonIds.filter(id => !activeMovies.find(m => m.id === id));
          if (missingIds.length > 0) {
            const { data: missing } = await db.from('movies').select('*').in('id', missingIds) as { data: Movie[] | null };
            if (missing?.length) setActiveMovies([...activeMovies, ...missing]);
          }
          const nextActivePairs = wonTurnsToPairs(activeWonTurns ?? []);
          const nextMyPairsFromDB = wonTurnsToPairs(myWonTurns ?? []);
          setActivePlayerPairs(nextActivePairs);
          // Only apply DB result if it has MORE pairs than current state.
          // Prevents a stale myWonTurns query (winner_id write still in-flight)
          // from overwriting an optimistic update already applied in handleNextTurn.
          setMyMoviePairs(prev => nextMyPairsFromDB.length > prev.length ? nextMyPairsFromDB : prev);
          // Now commit turn + players in the same batched render with correct pair state.
          setLocalTurn(latestTurn);
          setCurrentTurn(latestTurn);
          setLocalPlayers(fp);
          setPlayers(fp);
        } else {
          setLocalTurn(latestTurn);
          setCurrentTurn(latestTurn);
          if (!turnChanged && statusChanged && latestTurn.status === 'revealing') {
            // Refresh players on every device when the turn goes to revealing so coin
            // changes (written by handleReveal before flipping status) show up for all players.
            if (freshPlayers) { setLocalPlayers(freshPlayers as Player[]); setPlayers(freshPlayers as Player[]); }
          }
        }

        // placed_interval=-1 signals "I know it!" — exit the trailer view for everyone
        // (active player in private games may receive this signal from the host)
        if (!turnChanged && placedIntervalChanged && latestTurn.placed_interval === -1) {
          setTrailerEnded(true);
        }

        if (turnChanged) {
          setTrailerEnded(false);
          setTrailerRevealed(false);
          setCountdownDone(false);
          setVideoStarted(false);
          trailerRevealAnim.setValue(0);
          countdownFadeAnim.setValue(1);
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
          prevPlacedIntervalRef.current = undefined;
          challengerSwitchArmed.current = false;
          if (challengerSwitchTimerRef.current) { clearTimeout(challengerSwitchTimerRef.current); challengerSwitchTimerRef.current = null; }
          challengerSwitchInnerTimersRef.current.forEach(clearTimeout);
          challengerSwitchInnerTimersRef.current = [];
          setNextTurnPending(false);
          challengeDecisionMade.current = false;
          challengeConfirmedRef.current = false;
          betRevealTriggered.current = false;
          if (betRevealTimerRef.current) { clearTimeout(betRevealTimerRef.current); betRevealTimerRef.current = null; }
          setShowBetReveal(false);
          setBetRevealCount(0);
          setRevealPhase('flip');
          setWinnerPairs([]);
          setMovieGuess('');
          setDirectorGuess('');
          setRevealLocked(true);
          voiceStateRef.current = 'idle';
          setVoiceState('idle');
          setVoiceError('');
          setVoiceResult(null);
          setBonusPanelOpen(false);
          bonusPanelAnim.setValue(0);
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
        // Sync my own challenge in case it arrived from DB.
        // Don't overwrite while challengeConfirmed=true and DB still shows interval_index=-1:
        // the DB write from handleConfirmChallengeInterval may not have landed yet, and
        // reverting to -1 here would leave the interval unregistered if the write later fails.
        const mine = cData.find((c: Challenge) => c.challenger_id === myPlayerId);
        if (mine && (!challengeConfirmedRef.current || mine.interval_index >= 0)) setMyChallenge(mine);
      }

      // Always sync fresh player data (catches coin changes during challenging phase
      // which don't cause a turn status change and would otherwise be invisible until Next).
      if (freshPlayers && !turnChanged) {
        setLocalPlayers(freshPlayers as Player[]);
        setPlayers(freshPlayers as Player[]);
      }


      // Bet-reveal trigger: all devices show the "reveal bets" overlay when all decisions are in.
      // Active player's device also handles the fallback timer.
      if (latestTurn?.status === 'challenging' && !betRevealTriggered.current) {
        const cArr = cData ?? [];
        const allSettled = cArr.every((c: Challenge) => c.interval_index !== -1);
        const observersPoll = (freshPlayers as Player[] | null)?.filter(p => p.id !== latestTurn.active_player_id)
          ?? players.filter(p => p.id !== latestTurn.active_player_id);
        const activeTL = (freshPlayers as Player[] | null)?.find(p => p.id === latestTurn.active_player_id)?.timeline ?? [];
        const maxChallengersPoll = activeTL.length;
        const challengerLimitReachedPoll = maxChallengersPoll > 0 &&
          cArr.filter((c: Challenge) => c.interval_index !== -2).length >= maxChallengersPoll;
        const allDecided = observersPoll.length > 0 &&
          (cArr.length >= observersPoll.length || challengerLimitReachedPoll);

        // Active player: also initialize fallback timer and handle hard cutoffs
        if (myPlayerId === latestTurn.active_player_id && !revealTriggered.current) {
          if (challengeWindowStart.current === null) {
            challengeWindowStart.current = (allDecided && allSettled) ? Date.now() - 14000 : Date.now();
          }
          const elapsed = Date.now() - challengeWindowStart.current;
          // 10s soft cutoff: fire if all settled (no pending picks) regardless of allDecided.
          // 60s hard cutoff: unconditional safety net for device failure — in normal play
          //   each picker's own 15s HourglassTimer will have fired handlePickerTimeout well before this.
          if ((allDecided && allSettled) || (elapsed > 10000 && allSettled) || elapsed > 60000) {
            revealTriggered.current = true;
            betRevealTriggered.current = true;
            setShowBetReveal(true);
          }
        } else if (allDecided && allSettled) {
          // Non-active player: trigger overlay once all bets are confirmed
          betRevealTriggered.current = true;
          setShowBetReveal(true);
        }
      }
    }

  }

  async function loadState() {
    const g = game;
    if (!g) return;
    TVSession.setGameId(g.id);
    setLoading(true);

    const [{ data: pData }, { data: tData }] = await Promise.all([
      db.from('players').select('*').eq('game_id', g.id).is('left_at', null).order('created_at'),
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

    setLoading(false);
    startPolling();
  }

  // ── Helpers ──

  function intervalToRevealText(idx: number | null | undefined, sortedYears: number[]): string {
    if (idx === null || idx === undefined) return '?';
    if (idx === -2 || idx === -3) return 'Passed';
    if (sortedYears.length === 0) return 'first card ever';
    if (idx === 0) return `before ${sortedYears[0]}`;
    if (idx >= sortedYears.length) return `after ${sortedYears[sortedYears.length - 1]}`;
    return `between ${sortedYears[idx - 1]} and ${sortedYears[idx]}`;
  }

  function buildBetRevealRows(turn: Turn, sortedTimeline: number[]): Array<{ emoji: string; name: string; intervalText: string }> {
    const ap = getPlayer(turn.active_player_id);
    const rows = [{ emoji: '🎬', name: ap?.display_name ?? '?', intervalText: intervalToRevealText(turn.placed_interval, sortedTimeline) }];
    const sorted = [...challenges]
      .filter(c => c.interval_index !== -1)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const c of sorted) {
      const p = getPlayer(c.challenger_id);
      rows.push({
        emoji: c.interval_index >= 0 ? '⚡' : '💤',
        name: p?.display_name ?? '?',
        intervalText: c.interval_index >= 0 ? intervalToRevealText(c.interval_index, sortedTimeline) : 'Passed',
      });
    }
    return rows;
  }

  function getPlayer(id: string | null) {
    return players.find((p) => p.id === id) ?? null;
  }
  function getActivePlayer() { return getPlayer(currentTurn?.active_player_id ?? null); }
  function isActivePlayer() { return myPlayerId === currentTurn?.active_player_id; }
  function getMovie() { return activeMovies.find((m) => m.id === currentTurn?.movie_id) ?? movieOverride; }
  function getActivePlayerTimeline(): number[] { return getActivePlayer()?.timeline ?? []; }

  // ── Actions (with optimistic updates so UI responds instantly) ──

  async function handleStartGame() {
    if (!currentTurn) return;
    const now = new Date().toISOString();
    const optimistic = { ...currentTurn, placing_started_at: now };
    pendingTurnWrite.current = true;
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ placing_started_at: now }).eq('id', currentTurn.id);
    pendingTurnWrite.current = false;
  }

  async function handleConfirmPlacement() {
    if (!currentTurn || selectedInterval === null) return;
    haptics.impact();
    const optimistic = { ...currentTurn, placed_interval: selectedInterval, status: 'challenging' as const };
    pendingTurnWrite.current = true;
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ placed_interval: selectedInterval, status: 'challenging' }).eq('id', currentTurn.id);
    pendingTurnWrite.current = false;
  }

  async function handlePlacementTimeout() {
    const ct = currentTurnRef.current ?? currentTurn;
    // Allow -1 (the "trailer ended" pre-signal) — only bail if a real interval was already placed
    if (!ct || ct.status !== 'placing' || (ct.placed_interval !== null && ct.placed_interval !== -1)) return;
    const optimistic = { ...ct, placed_interval: -1, status: 'challenging' as const };
    pendingTurnWrite.current = true;
    setLocalTurn(optimistic);
    setCurrentTurn(optimistic);
    currentTurnRef.current = optimistic;
    await db.from('turns').update({ placed_interval: -1, status: 'challenging' }).eq('id', ct.id);
    pendingTurnWrite.current = false;
  }

  async function handleChallenge() {
    if (!currentTurn || myChallenge) return;
    if (challengeDecisionMade.current) return;
    haptics.impact();
    challengeDecisionMade.current = true;
    setHasPassed(false);
    // Optimistic: close the decision panel immediately
    const tempChallenge = { id: 'pending', turn_id: currentTurn.id, challenger_id: myPlayerId!, interval_index: -1, created_at: new Date().toISOString() } as Challenge;
    setMyChallenge(tempChallenge);
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
    haptics.select();
    challengeDecisionMade.current = true;
    setHasPassed(true);
    if (!currentTurn) return;
    // Optimistic: close the decision panel immediately
    const tempChallenge = { id: 'pending', turn_id: currentTurn.id, challenger_id: myPlayerId!, interval_index: -2, created_at: new Date().toISOString() } as Challenge;
    setMyChallenge(tempChallenge);
    const { data: inserted } = await db
      .from('challenges')
      .insert({ turn_id: currentTurn.id, challenger_id: myPlayerId!, interval_index: -2 })
      .select().single() as { data: Challenge | null };
    if (inserted) setMyChallenge(inserted);
  }

  async function handleConfirmChallengeInterval() {
    if (!myChallenge || myChallenge.id === 'pending' || challengeInterval === null) return;
    haptics.impact();
    const savedChallenge = myChallenge;
    setMyChallenge({ ...myChallenge, interval_index: challengeInterval });
    setChallengeConfirmed(true);
    const { error } = await (db.from('challenges')
      .update({ interval_index: challengeInterval })
      .eq('id', myChallenge.id) as Promise<{ error: any }>);
    if (error) {
      // Roll back so the user can retry (gap stays selected, ✓ reappears)
      setMyChallenge(savedChallenge);
      setChallengeConfirmed(false);
    }
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

  async function handlePickerTimeout() {
    // Timer ran out before challenger picked an interval — withdraw without refunding the coin.
    const mc = myChallengeRef.current;
    if (!mc || mc.id === 'pending' || mc.interval_index !== -1) return;
    const updated = { ...mc, interval_index: -3 };
    setMyChallenge(updated);
    myChallengeRef.current = updated;
    setChallengeInterval(null);
    await db.from('challenges').update({ interval_index: -3 }).eq('id', mc.id);
  }

  function handleAnimatedConfirm() {
    Animated.timing(leftPanelFade, { toValue: 0, duration: 200, useNativeDriver: true }).start();
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
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        voiceStateRef.current = 'error';
        setVoiceError('Microphone permission denied. Please type instead.');
        setVoiceState('error');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      meteringIntervalRef.current = setInterval(() => {
        const status = recorder.getStatus();
        if (!status.isRecording || status.metering === undefined) return;
        const level = Math.max(0, Math.min(1, (status.metering + 60) / 60));
        const sample = Math.max(0.07, Math.min(1, level + (Math.random() * 0.25 - 0.125)));
        waveformHistory.current.shift();
        waveformHistory.current.push(sample);
        waveformHistory.current.forEach((val, i) => {
          Animated.timing(waveformBars[i], { toValue: val, duration: 60, useNativeDriver: true }).start();
        });
      }, 80);
      voiceStateRef.current = 'recording';
      setVoiceState('recording');
    } catch {
      voiceStateRef.current = 'error';
      setVoiceError('Could not start recording. Please type instead.');
      setVoiceState('error');
    }
  }

  async function stopVoice() {
    if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null; }
    if (!recorder.isRecording) return;
    voiceStateRef.current = 'processing';
    setVoiceState('processing');
    waveformHistory.current.fill(0.07);
    waveformBars.forEach((bar) =>
      Animated.timing(bar, { toValue: 0.07, duration: 200, useNativeDriver: true }).start()
    );
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording URI');

      const transcript = await transcribeAudio(uri);

      if (!transcript) {
        voiceStateRef.current = 'error';
        setVoiceError("Didn't catch that. Please try again or type.");
        setVoiceState('error');
        return;
      }

      const movie = getMovie();
      if (!movie) {
        setVoiceResult({ movie: transcript, director: '' });
        voiceStateRef.current = 'result';
        setVoiceState('result');
        return;
      }

      const scan = scanTranscript(transcript, movie);
      let titleValue: string | null = scan.title;
      let directorValue: string | null = scan.director;

      if (!titleValue || !directorValue) {
        const extracted = await llmExtractGuess(transcript);
        if (!titleValue && extracted.title) {
          titleValue = phoneticMatch(extracted.title, movie.title) ? movie.title : extracted.title;
        }
        if (!directorValue && extracted.director) {
          if (phoneticMatch(extracted.director, movie.director ?? '')) {
            directorValue = movie.director ?? '';
          } else {
            const tmdbName = await searchDirector(extracted.director);
            directorValue = (tmdbName && phoneticMatch(extracted.director, tmdbName))
              ? tmdbName
              : extracted.director;
          }
        }
      }

      setVoiceResult({ movie: titleValue ?? transcript, director: directorValue ?? '' });
      voiceStateRef.current = 'result';
      setVoiceState('result');
    } catch (e: any) {
      console.error('[voice] stopVoice error:', e?.message ?? e);
      voiceStateRef.current = 'error';
      setVoiceError(e?.message ?? 'Transcription failed. Please type instead.');
      setVoiceState('error');
    }
  }

  function openBonus() {
    haptics.select();
    setBonusPanelOpen(true);
    Animated.spring(bonusPanelAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }
  function closeBonus() {
    Keyboard.dismiss();
    Animated.timing(bonusPanelAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setBonusPanelOpen(false));
  }
  function handleReplayBonus() {
    setBonusPanelOpen(false);
    bonusPanelAnim.setValue(0);
    Keyboard.dismiss();
    setHasReplayed(true);
    setReadyToPlace(false);
    setTrailerEnded(false);
    setTrailerRevealed(false);
    setVideoStarted(false);
    setUserPaused(false);
    trailerRevealAnim.setValue(0);
    countdownFadeAnim.setValue(1);
    setTrailerKey(k => k + 1);
  }

  // Wraps handleNextTurn with a "lights out" fade so the reveal→drawing hand-off
  // is a continuous fade-to-black → fade-from-black instead of a hard swap.
  // The overlay is rendered in both the reveal and drawing phase trees so the
  // darkness persists across the phase switch.
  async function handleNextTurnWithFade() {
    if (nextTurnInProgress.current) return;
    // Acquire the lock and kill the auto-advance countdown BEFORE the fade.
    // Otherwise a countdown tick can fire handleNextTurnWithFade again after
    // the first handleNextTurn completes and releases the lock — inserting a
    // spurious successor turn that reverts the active player.
    nextTurnInProgress.current = true;
    setNextTurnPending(true);
    await new Promise<void>((resolve) => {
      Animated.timing(lightsOnAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }).start(() => resolve());
    });
    handleNextTurn();
  }

  async function handleNextTurn() {
    // Acquire the lock if we weren't called from handleNextTurnWithFade (which
    // already acquired it). Without this branch, the fade-path call would hit
    // the guard and return early.
    if (!nextTurnInProgress.current) {
      nextTurnInProgress.current = true;
      setNextTurnPending(true);
    }
    let succeeded = false;
    try {
      const g = game;
      // Use the ref so we never act on a stale closure value
      const ct = currentTurnRef.current;
      if (!g || !ct) return;

      // Fire all independent initial fetches in parallel:
      // movie, fresh players, cross-device guard, past turns (for movie dedup).
      const movieFromCache = activeMovies.find((m) => m.id === ct.movie_id) ?? null;
      const [movieResult, freshPlayersResult, existingNextResult, pastTurnsResult] = await Promise.all([
        movieFromCache
          ? Promise.resolve({ data: movieFromCache })
          : db.from('movies').select('*').eq('id', ct.movie_id).single(),
        db.from('players').select('*').eq('game_id', g.id).is('left_at', null).order('created_at') as Promise<{ data: Player[] | null }>,
        db.from('turns').select('id').eq('game_id', g.id).neq('status', 'complete').gt('created_at', ct.created_at).limit(1) as Promise<{ data: { id: string }[] | null }>,
        g.game_mode !== 'insane'
          ? (prefetchedPastTurnsRef.current ?? db.from('turns').select('movie_id').eq('game_id', g.id))
          : Promise.resolve({ data: [] as { movie_id: string }[] }),
      ]);
      prefetchedPastTurnsRef.current = null;

      const movie = (movieResult.data as typeof movieFromCache) ?? null;
      if (!movie) return;

      // Fetch fresh player data BEFORE the cross-device guard so winner computation
      // and myMoviePairs sync happen on EVERY device, not just the one that "wins the race".
      const { data: freshPlayers } = freshPlayersResult;
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

      // winner_id is written later (alongside timeline) — see below.

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
      const { data: existingNext } = existingNextResult;
      if (existingNext && existingNext.length > 0) {
        await poll();
        // Another device already advanced — the game moved forward, so treat
        // this as a success (poll's turnChanged branch will reset the lock).
        succeeded = true;
        return;
      }

      // Refund coins for challengers who placed at a valid interval but didn't win the card.
      // Runs on the single device that passes the cross-device guard — no race condition.
      // Fire-and-forget in parallel — coin values are derived from memory, no ordering needed.
      let playersAfterRefunds = latestPlayers;
      const refundWrites: Promise<any>[] = [];
      for (const c of challenges) {
        if (c.interval_index < 0) continue; // passed / withdrew / unpicked
        // Refund a challenger only when they picked a valid interval AND did NOT win the card.
        // Winning the card already pays them; the coin refund is consolation for being right but losing the tie-break.
        const pickedValid = validIntervals.includes(c.interval_index);
        const isWinner    = winnerId === c.challenger_id;
        const shouldRefund = pickedValid && !isWinner;
        if (shouldRefund) {
          const p = playersAfterRefunds.find(pl => pl.id === c.challenger_id);
          if (p) {
            const refunded = p.coins + 1;
            refundWrites.push(db.from('players').update({ coins: refunded }).eq('id', c.challenger_id));
            playersAfterRefunds = playersAfterRefunds.map(pl => pl.id === c.challenger_id ? { ...pl, coins: refunded } : pl);
          }
        }
      }
      if (refundWrites.length > 0) Promise.all(refundWrites);

      // Compute new timeline in memory for nextPlayer calculation, but defer the DB
      // write until AFTER the new turn is inserted. This closes the race window where
      // a background poll could fetch the updated player timeline while currentTurn is
      // still 'revealing', causing the won card to appear twice (once as revealingMovie
      // and once as a regular CardFront in the updated winnerTimeline).
      let updatedPlayers = playersAfterRefunds;
      let winnerNewTimeline: number[] | null = null;
      if (winnerId) {
        const winner = playersAfterRefunds.find(p => p.id === winnerId) ?? null;
        if (winner) {
          winnerNewTimeline = [...winner.timeline, movie.year].sort((a, b) => a - b);
          updatedPlayers = playersAfterRefunds.map(p => p.id === winnerId ? { ...p, timeline: winnerNewTimeline! } : p);
          if (winnerId === myPlayerId) myTimelineFloorRef.current = winnerNewTimeline;

          // Game over — winner reached the target card count
          if (winnerNewTimeline.length >= WIN_CARDS) {
            await db.from('players').update({ timeline: winnerNewTimeline }).eq('id', winnerId);
            await db.from('games').update({ status: 'finished' }).eq('id', g.id);
            setLocalPlayers(updatedPlayers);
            setPlayers(updatedPlayers);
            setGameOver({ ...winner, timeline: winnerNewTimeline });
            stopPolling();
            succeeded = true;
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

      // Use the past turns already fetched in the initial parallel group.
      // All past turn movie_ids — includes phantom 'complete' turns for starting cards.
      // Build the exclusion set from three independent sources:
      // 1. All past turn movie IDs (includes phantom 'complete' turns when they exist)
      // 2. startingMovieIds from Zustand (host-device backup)
      // 3. Inferred starting card years: any year in a player's timeline that has no
      //    matching past turn must be a starting card year — robust against phantom turn
      //    failures and Zustand being unavailable on non-host devices.
      const { data: pastTurns } = pastTurnsResult;
      const pastTurnMovieIds = new Set<string>(pastTurns?.map((t: { movie_id: string }) => t.movie_id) ?? []);
      const pastTurnYears = new Set<number>(
        [...pastTurnMovieIds]
          .map(id => activeMovies.find(m => m.id === id)?.year)
          .filter((y): y is number => y !== undefined)
      );
      const startingCardYears = new Set<number>(
        latestPlayers.flatMap(p => p.timeline ?? []).filter(year => !pastTurnYears.has(year))
      );
      const nextPlatform = (g.trailer_platform ?? 'ios') as 'ios' | 'android';
      let nextMovieId: string;
      if (g.game_mode === 'insane') {
        const m = await (prefetchedInsaneMovieRef.current ?? fetchRandomInsaneMovie(db, nextPlatform));
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
        const platformPool = activeMovies.filter(m =>
          nextPlatform === 'ios' ? m.available_ios !== false : m.available_android !== false
        );
        const pool = platformPool.filter((m) => !usedMovieIds.has(m.id));
        const nextMovie = pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]
          : platformPool[Math.floor(Math.random() * platformPool.length)];
        nextMovieId = nextMovie.id;
      }

      // Mark the outgoing turn 'complete' (with winner_id if any) BEFORE inserting
      // the successor. The partial unique index turns_one_live_per_game_idx only
      // allows one non-complete turn per game, so the old turn must exit the live
      // set before the new one enters it. Combining status + winner_id in one
      // update also means observer polls see a consistent winner_id whenever the
      // new turn becomes visible.
      const oldTurnUpdate: { status: 'complete'; winner_id?: string } = { status: 'complete' };
      if (winnerId) oldTurnUpdate.winner_id = winnerId;
      await db.from('turns').update(oldTurnUpdate).eq('id', ct.id);

      const { error: insertError } = await db.from('turns').insert({
        game_id: g.id,
        active_player_id: nextPlayer.id,
        movie_id: nextMovieId,
        status: 'placing',
        placing_started_at: new Date().toISOString(),
      });
      if (insertError) {
        // 23505 = unique_violation from turns_one_live_per_game_idx: another
        // device already inserted the successor turn. Sync UI and exit cleanly.
        if (insertError.code === '23505') {
          await poll();
          succeeded = true;
          return;
        }
        if (__DEV__) console.warn('[NXT] insert failed:', insertError.message, insertError.code);
        return;
      }

      // Mark success as soon as the new turn is committed. The timeline write
      // below can run async; the lock stays held until poll() → turnChanged
      // resets it (line 634). This prevents a stale auto-advance tick from
      // firing a second handleNextTurn in the window after finally releases
      // but before poll has applied the new turn state locally.
      succeeded = true;

      // Timeline write runs AFTER the new turn is visible, to avoid the
      // double-card flash where an observer sees the winner's updated timeline
      // while currentTurn is still the old revealing turn (card appears both in
      // reveal view and in the timeline). The previous turn is now 'complete'
      // so the newest non-complete turn is always the new drawing turn.
      if (winnerId && winnerNewTimeline) {
        await db.from('players').update({ timeline: winnerNewTimeline }).eq('id', winnerId);
        if (winnerId === myPlayerId) myTimelineFloorRef.current = null;
      }
      // Fire-and-forget: sync all devices.
      poll();
    } finally {
      setNextTurnPending(false);
      // Only release the lock on failure. On success, the lock stays set so a
      // queued auto-advance tick (or repeat tap during the async poll window)
      // cannot trigger another handleNextTurn before currentTurnRef is updated.
      // poll()'s turnChanged branch (line ~634) resets the lock when the new
      // turn is visible locally.
      if (!succeeded) nextTurnInProgress.current = false;
    }
  }

  // ── Phase renderers ──

  if (gameOver) {
    return <GameOverScreen winner={gameOver} players={players} myId={myPlayerId} />;
  }

  if (showCountdown) {
    return (
      <FilmCountdown
        from={3}
        onComplete={() => {
          setShowCountdown(false);
          setShowIntro(true);
        }}
      />
    );
  }

  if (loading || !currentTurn) {
    return <BrandedLoader />;
  }

  if (showIntro) {
    const myPlayer = players.find(p => p.id === myPlayerId) ?? null;
    const startingYear = myPlayer?.timeline[0];
    const startingPair = startingYear !== undefined ? myMoviePairs.find(p => p.year === startingYear) : undefined;
    const startingMovie = startingPair
      ? (activeMovies.find(m => m.id === startingPair.id) ?? activeMovies.find(m => m.year === startingYear) ?? null)
      : (activeMovies.find(m => m.year === startingYear) ?? null);
    const amHostIntro = players.length > 0 && players[0].id === myPlayerId;
    const allPlayersReady = players.length > 0 && players.every(p => p.last_seen !== null);
    return (
      <GameIntroScreen
        startingMovie={startingMovie}
        playerName={myPlayer?.display_name ?? 'Player'}
        onDone={() => {
          setShowIntro(false);
          handleStartGame();
        }}
        onSpinComplete={() => {
          introShownRef.current = true;
          if (myPlayerId) {
            const now = new Date().toISOString();
            // Optimistic: show current player as ready immediately
            setLocalPlayers(prev => prev.map(p => p.id === myPlayerId ? { ...p, last_seen: now } : p));
            // .then(() => {}) forces the Supabase v2 lazy query to actually execute
            db.from('players').update({ last_seen: now }).eq('id', myPlayerId).then(() => {});
          }
        }}
        allMovies={activeMovies}
        players={players}
        amHost={amHostIntro}
        allPlayersReady={allPlayersReady}
      />
    );
  }

  const movie = getMovie();
  const activePlayer = getActivePlayer();
  const amActive = isActivePlayer();
  const timeline = getActivePlayerTimeline();
  // Host = first player by created_at (matches local-lobby ordering)
  const amHost = players.length > 0 && players[0].id === myPlayerId;

  // My own timeline (for "my timeline" modal and drawing phase display).
  // Use myTimelineFloorRef as a floor so the interval poll can't briefly show a
  // timeline missing a just-won card while the DB write is still in-flight.
  const _rawMyTimeline = (players.find(p => p.id === myPlayerId)?.timeline ?? []).slice().sort((a, b) => a - b);
  const _floor = myTimelineFloorRef.current;
  const myTimeline = (_floor && _floor.length > _rawMyTimeline.length) ? _floor : _rawMyTimeline;

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

  // Index-aligned cards for CollapsibleMyTimeline (undefined = movie not yet resolved).
  const myTimelineCards = myTimeline.map((_, i) => resolveMovie(myTimeline, i, myMoviePairs));

  // Shared between drawing and placing-trailer phases
  const drawingTimeline = amActive ? myTimeline : timeline;
  const drawingPlacedMovies = amActive ? myPlacedMovies : placedMovies;
  const activePlayerIdx = players.findIndex(p => p.id === currentTurn.active_player_id);
  const activePlayerColor = activePlayerIdx >= 0
    ? PLAYER_CHIP_COLORS[activePlayerIdx % PLAYER_CHIP_COLORS.length]
    : C.textSub;

  // ── Leave game ──
  async function handleLeaveConfirmed() {
    setShowLeaveDialog(false);
    stopPolling();
    const g = game;
    const ct = currentTurnRef.current;
    try {
      if (g) {
        const { data: currentPlayers } = await db.from('players').select('*')
          .eq('game_id', g.id).is('left_at', null).order('created_at');
        const allPlayers = (currentPlayers ?? []) as Player[];
        const remaining = allPlayers.filter(p => p.id !== myPlayerId);

        if (remaining.length === 1) {
          // Sole survivor wins by default. Mark the live turn complete first
          // so polls on the winner's device see a consistent finished state.
          if (ct && ct.status !== 'complete') {
            await db.from('turns').update({ status: 'complete' }).eq('id', ct.id);
          }
          await db.from('games').update({ status: 'finished' }).eq('id', g.id);
        } else if (remaining.length > 1 && ct && ct.active_player_id === myPlayerId &&
                   (ct.status === 'drawing' || ct.status === 'placing')) {
          // I was the active player — advance the turn before leaving so the
          // game doesn't stall waiting on a tombstoned player.
          const myIdx = allPlayers.findIndex(p => p.id === myPlayerId);
          const nextPlayer = remaining[myIdx % remaining.length] ?? remaining[0];
          const leavePlatform = (g.trailer_platform ?? 'ios') as 'ios' | 'android';
          const { data: pastTurns } = await db.from('turns').select('movie_id').eq('game_id', g.id);
          let leaveNextMovieId: string;
          if (g.game_mode === 'insane') {
            const m = await fetchRandomInsaneMovie(db, leavePlatform);
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
            const leavePlatformPool = activeMovies.filter(m =>
              leavePlatform === 'ios' ? m.available_ios !== false : m.available_android !== false
            );
            const pool = leavePlatformPool.filter(m => !usedIds.has(m.id));
            const nextMovie = pool.length > 0
              ? pool[Math.floor(Math.random() * pool.length)]
              : leavePlatformPool[Math.floor(Math.random() * leavePlatformPool.length)];
            leaveNextMovieId = nextMovie.id;
          }
          // Mark the abandoned turn as 'complete' first so the turns_one_live_per_game
          // unique index allows the successor insert. winner_id stays null (no card awarded).
          await db.from('turns').update({ status: 'complete' }).eq('id', ct.id);
          await db.from('turns').insert({
            game_id: g.id,
            active_player_id: nextPlayer.id,
            movie_id: leaveNextMovieId,
            status: 'placing',
            placing_started_at: new Date().toISOString(),
          });
        } else if (remaining.length === 0) {
          // I was the last one in. Cancel the game so it doesn't linger.
          await db.from('games').update({ status: 'cancelled' }).eq('id', g.id);
        }
      }
      if (myPlayerId) {
        await db.from('players').update({ left_at: new Date().toISOString() }).eq('id', myPlayerId);
      }
    } catch (_) {
      // Best-effort — navigate away regardless.
    }
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    router.replace('/');
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

  const castOverlay = castVisible ? (
    <TouchableOpacity style={[StyleSheet.absoluteFill, styles.modalBackdrop]} activeOpacity={1} onPress={() => setCastVisible(false)}>
      <View style={styles.castSheet} onStartShouldSetResponder={() => true}>
        <View style={styles.castSheetHeader}>
          <Text style={styles.castSheetTitle}>📺  Cast to TV</Text>
          <TouchableOpacity onPress={() => setCastVisible(false)} style={styles.castCloseBtn}>
            <CloseIcon size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>
        {Platform.OS === 'ios' ? (
          <View style={styles.castAirPlayRow}>
            <Text style={styles.castAirPlayLabel}>Mirror to TV via AirPlay</Text>
            <AirPlayButton style={styles.castAirPlayBtn} />
          </View>
        ) : (
          <Text style={styles.castSheetBody}>
            Swipe down twice → Quick Settings → Tap Cast
          </Text>
        )}
        <TouchableOpacity style={styles.castStartBtn} onPress={() => { setTvMode(true); setCastVisible(false); }}>
          <Text style={styles.castStartBtnText}>Start Playing →</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ) : null;

  const castFab = (amHost && game?.visibility !== 'public') ? (
    <TouchableOpacity style={[styles.castFab, { top: insets.top + 14 }]} onPress={() => setCastVisible(true)} activeOpacity={0.8}>
      <CastToTVIcon size={16} color="rgba(255,255,255,0.75)" />
    </TouchableOpacity>
  ) : null;

  // Leave-game chip — top-left, mirrors cast FAB. Hidden during trailer playback,
  // reveal/suspense, and game-over so it can't be tapped at moments where leaving
  // would interrupt a synchronised animation (or be meaningless). Stays visible
  // during the pre-trailer timeline preview countdown.
  const trailerPlaying =
    currentTurn?.status === 'placing' && trailerRevealed && !trailerEnded;
  const showLeaveChip = !gameOver && !trailerPlaying && (
    currentTurn?.status === 'drawing' ||
    currentTurn?.status === 'placing' ||
    currentTurn?.status === 'challenging'
  );
  const leaveChip = showLeaveChip ? (
    <TouchableOpacity
      style={[styles.leaveChip, { top: insets.top + 14 }]}
      onPress={() => setShowLeaveDialog(true)}
      activeOpacity={0.8}
      hitSlop={10}
    >
      <ArrowLeftIcon size={16} color="rgba(255,255,255,0.75)" />
    </TouchableOpacity>
  ) : null;

  // Synchronous transition detection — must happen before phase returns so the overlay is
  // dark on the very first painted frame (no 1-frame parchment flash).
  {
    const _prev = prevStatusRef.current;
    prevStatusRef.current = currentTurn?.status ?? null;
    if (_prev === 'revealing' && currentTurn?.status === 'placing') {
      lightsOnAnim.setValue(1);
    }
  }

  // Persistent overlay stack — rendered as a stable sibling after each phase's
  // tree so the chips/modals/cast controls don't remount on phase change.
  // MyTimelinePanel stays inline per-phase because its timeline prop differs
  // during the reveal-winner optimistic insert.
  const persistentOverlays = (
    <>
      <PlayerChips players={players} myId={myPlayerId} topInset={insets.top} hasCastFab={!!castFab} />
      {leaveChip}
      {leaveModal}
      {castFab}
      {castOverlay}
      {airPlayAvailable && amHost && !castVisible && !tvMode && !tvBannerDismissed && (
        <TouchableOpacity
          style={[styles.tvDetectedBanner, { top: insets.top + 56 }]}
          onPress={() => { setTvBannerDismissed(true); setCastVisible(true); }}
          activeOpacity={0.85}
        >
          <Text style={styles.tvDetectedBannerText}>📺 TV detected nearby — tap to connect</Text>
          <TouchableOpacity onPress={() => setTvBannerDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.tvDetectedBannerClose}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </>
  );

  // ── PLACING ──
  if (currentTurn.status === 'placing') {
    if (!movie) return <LoadingScreen />;


    // ── Timeline (after trailer + ready) ──
    if (readyToPlace) {
      const bonusEntered = !!(movieGuess.trim() || directorGuess.trim());
      const bonusScale = bonusPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

      return (
        <>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'height' : undefined}>
        <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
          <View style={styles.gameArea}>
            <Animated.View style={[styles.timelineAreaFull, { paddingBottom: timelinePaddingBottom }]}>
              {amActive ? (
                <View style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' }}>
                  <HourglassTimer durationMs={30000} size={40} onExpire={handlePlacementTimeout} label="to place the card in the timeline" paused={bonusPanelOpen} />
                </View>
              ) : (
                <View style={styles.placePromptRow}>
                  <Image source={lcHourglass} style={styles.waitingHourglassIcon} tintColor={C.textSub} />
                  <Text style={styles.placePromptText}>{`Waiting for ${activePlayer?.display_name}…`}</Text>
                </View>
              )}
              <Timeline
                ref={amActive ? timelineRef : undefined}
                timeline={timeline}
                currentCardMovie={amActive ? (movie ?? undefined) : undefined}
                interactive={amActive}
                selectedInterval={amActive ? selectedInterval : null}
                onIntervalSelect={amActive ? (i) => { setSelectedInterval(i); if (bonusPanelOpen) closeBonus(); } : () => {}}
                onConfirm={amActive ? handleAnimatedConfirm : () => {}}
                placedMovies={placedMovies}
                hideFloatingCard
              />
            </Animated.View>
          </View>

          {/* ── Bonus FABs — floats above bottom inset, last child → on top ── */}
          {amActive && (
            <View style={[styles.bonusFabColumn, { bottom: insets.bottom + 12 }]}>
              {/* Coin FAB row — with first-turn tooltip to the left */}
              <View style={styles.bonusFabMainRow}>
                {myTimeline.length <= 1 && !bonusEntered && !bonusPanelOpen && (
                  <View style={styles.bonusFabTip}>
                    <Text style={styles.bonusFabTipText}>Guess title &amp; director for a bonus coin</Text>
                    <Text style={styles.bonusFabTipArrow}>›</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.bonusFab, bonusEntered && styles.bonusFabDone]}
                  onPress={bonusPanelOpen ? closeBonus : openBonus}
                  activeOpacity={0.85}
                >
                  {bonusEntered
                    ? <Text style={styles.bonusFabCheck}>✓</Text>
                    : <Image source={lcCoin} style={styles.bonusFabIcon} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Bonus overlay — right-side panel, anchored above the FAB ── */}
          {amActive && bonusPanelOpen && (
            <Animated.View
              style={[styles.bonusOverlay, {
                bottom: insets.bottom + 62,
                maxHeight: screenHeight - insets.top - insets.bottom - 62 - 12,
                opacity: bonusPanelAnim,
                transform: [{ scale: bonusScale }],
              }]}
            >
              {/* Header */}
              <View style={styles.bonusOverlayHeader}>
                <Text style={styles.bonusOverlayTitle}>🪙  Name the movie</Text>
                <TouchableOpacity onPress={closeBonus} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <CloseIcon size={14} color={C.textSubDark} />
                </TouchableOpacity>
              </View>

              {/* Body: voice result OR inputs */}
              {voiceState === 'result' && voiceResult ? (
                <View style={styles.bonusVoiceResultStack}>
                  <Text style={styles.bonusVoiceResultTitle}>{voiceResult.movie || '—'}</Text>
                  <Text style={styles.bonusVoiceResultSub}>{voiceResult.director || '—'}</Text>
                  <View style={styles.bonusVoiceResultBtns}>
                    <TouchableOpacity style={styles.bonusVoiceRetryBtn} onPress={() => { voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceResult(null); setMovieGuess(''); setDirectorGuess(''); }} activeOpacity={0.7}>
                      <Text style={styles.bonusVoiceRetryText}>Retry</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.bonusVoiceRetryBtn} onPress={() => {
                      setMovieGuess(voiceResult.movie ?? '');
                      setDirectorGuess(voiceResult.director ?? '');
                      voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceResult(null);
                    }} activeOpacity={0.7}>
                      <Text style={styles.bonusVoiceRetryText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.bonusVoiceAcceptBtn, { flex: 1 }]} onPress={() => {
                      setMovieGuess(voiceResult.movie ?? '');
                      setDirectorGuess(voiceResult.director ?? '');
                      voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceResult(null);
                      closeBonus();
                    }} activeOpacity={0.7}>
                      <Text style={styles.bonusVoiceAcceptText}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : voiceState === 'recording' ? (
                <View style={styles.bonusVoiceRecordColumn}>
                  <View style={styles.waveformRow}>
                    {waveformBars.map((anim, i) => (
                      <Animated.View key={i} style={[styles.waveformBar, { transform: [{ scaleY: anim }] }]} />
                    ))}
                  </View>
                  <TouchableOpacity style={styles.voiceStopBtn} onPress={stopVoice} activeOpacity={0.75}>
                    <View style={styles.voiceStopSquare} />
                  </TouchableOpacity>
                </View>
              ) : voiceState === 'processing' ? (
                <View style={styles.bonusVoiceRecordColumn}>
                  <ActivityIndicator color={C.ochre} size="small" />
                  <Text style={styles.bonusInputPlaceholder}>Processing…</Text>
                </View>
              ) : (
                <View style={styles.bonusInputsStack}>
                  <TextInput
                    style={styles.bonusInput}
                    placeholder="Movie title…"
                    placeholderTextColor={C.textMutedDark}
                    value={movieGuess}
                    onChangeText={setMovieGuess}
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <View style={styles.bonusInputDirectorRow}>
                    <TextInput
                      style={[styles.bonusInput, { flex: 1 }]}
                      placeholder="Director…"
                      placeholderTextColor={C.textMutedDark}
                      value={directorGuess}
                      onChangeText={setDirectorGuess}
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={styles.bonusMicBtn} onPress={startVoice} activeOpacity={0.75}>
                      <Text style={styles.bonusMicIcon}>🎤</Text>
                    </TouchableOpacity>
                  </View>
                  {voiceState === 'error' && (
                    <View style={{ gap: 4 }}>
                      {!!voiceError && <Text style={styles.voiceErrorText}>{voiceError}</Text>}
                      <TouchableOpacity onPress={() => { voiceStateRef.current = 'idle'; setVoiceState('idle'); setVoiceError(''); }} activeOpacity={0.7}>
                        <Text style={styles.bonusVoiceRetryText}>⚠ Retry</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </Animated.View>
          )}

          {myTimeline.length > 0 && (
            <MyTimelinePanel timeline={myTimeline} cards={myTimelineCards} bottomInset={insets.bottom} screenHeight={screenHeight} />
          )}
        </SafeAreaView>
        </KeyboardAvoidingView>
        {persistentOverlays}
        </>
      );
    }

    // ── Trailer ended — observer waiting screen ──
    if (trailerEnded && !amActive) {
        return (
          <>
          <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
            <View style={styles.gameArea}>
              <View style={[styles.timelineAreaFull, { paddingBottom: timelinePaddingBottom }]}>
                <View style={styles.placePromptRow}>
                  <Image source={lcHourglass} style={styles.waitingHourglassIcon} tintColor={C.textSub} />
                  <Text style={styles.placePromptText}>Waiting for {activePlayer?.display_name} to place the card…</Text>
                </View>
                <Timeline
                  timeline={timeline}
                  interactive={false}
                  selectedInterval={null}
                  onIntervalSelect={() => {}}
                  onConfirm={() => {}}
                  placedMovies={placedMovies}
                  hideFloatingCard
                />
              </View>
            </View>
            {amActive && !hasReplayed && (
              <View style={[styles.placingBottomStrip, { paddingHorizontal: 24, paddingVertical: 12 }]}>
                <TouchableOpacity
                  style={{ alignSelf: 'stretch', paddingVertical: 10, borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                  onPressIn={() => {
                    setHasReplayed(true);
                    setTrailerEnded(false);
                    setUserPaused(false);
                    setTrailerKey(k => k + 1);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.sm }}>↺ Replay trailer</Text>
                </TouchableOpacity>
              </View>
            )}
            {myTimeline.length > 0 && (
              <MyTimelinePanel timeline={myTimeline} cards={myTimelineCards} bottomInset={insets.bottom} screenHeight={screenHeight} />
            )}
          </SafeAreaView>
          {persistentOverlays}
          </>
        );
      }


    // In private games, only the host's phone plays the actual video.
    const showVideo = amHost || game?.visibility === 'public';

    // Remaining countdown duration — synced across devices via placing_started_at
    // (requires DB migration: ALTER TABLE turns ADD COLUMN placing_started_at TIMESTAMPTZ)
    const remainingPreview = currentTurn.placing_started_at
      ? Math.max(1000, PREVIEW_DURATION - (Date.now() - new Date(currentTurn.placing_started_at).getTime()))
      : PREVIEW_DURATION;

    // ── Trailer screen + countdown overlay ──
    return (
      <>
      {/* Base: drawing timeline underneath (visible only when trailer overlay is absent) */}
      <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
        <View style={styles.gameArea}>
          <View style={[styles.timelineAreaFull, { paddingBottom: timelinePaddingBottom }]}>
            <Text style={[styles.drawingTurnLabel, { color: activePlayerColor }]}>
              {amActive ? 'Your turn' : `${activePlayer?.display_name}'s timeline`}
            </Text>
            <View style={{ minHeight: 148 }}>
              {movie && (
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
          </View>
        </View>
        {myTimeline.length > 0 && (
          <MyTimelinePanel timeline={myTimeline} cards={myTimelineCards} bottomInset={insets.bottom} screenHeight={screenHeight} />
        )}
      </SafeAreaView>

      {/* Trailer overlay — always rendered here so TrailerPlayer never remounts */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: trailerRevealAnim }]}
        pointerEvents={(countdownDone && trailerRevealed) ? 'auto' : 'none'}>
        {/* Video: host's phone only in private games; all phones in public games */}
        {showVideo && (
          <TrailerPlayer
            key={`${currentTurn.id}-${trailerKey}`}
            ref={trailerRef}
            movie={movie}
            unmuteAfterMs={remainingPreview + 500}
            onEnded={() => { setTrailerEnded(true); setUserPaused(false); }}
            onRevealed={() => setTrailerRevealed(true)}
            onPlaying={() => setVideoStarted(true)}
          />
        )}

        {/* Non-host observers: waiting message */}
        {!showVideo && !amActive && (
          <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} edges={['top', 'bottom']}>
            <Image source={lcPopcorn} style={styles.endedTitleIcon} />
            <Text style={styles.endedWaiting}>{players[0]?.display_name} is watching the trailer…</Text>
          </SafeAreaView>
        )}

        {/* Touch blocker — prevents YouTube from showing title on tap */}
        {showVideo && !userPaused && (
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              if (amActive && trailerRevealed) { trailerRef.current?.pause(); setUserPaused(true); }
            }}
          />
        )}

        {/* Controls: active player watching video (host / public) — corner overlay */}
        {amActive && showVideo && trailerRevealed && (
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

        {/* Controls: active player not watching video (private game, not host) — centered */}
        {amActive && !showVideo && countdownDone && (
          <SafeAreaView style={styles.activeNoVideoOverlay} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
            <View />
            <View style={styles.activeNoVideoCenter}>
              <Text style={styles.watchingBadgeText}>🎬 Trailer is on {players[0]?.display_name}'s screen</Text>
              <TouchableOpacity
                style={[styles.knowItBtn, !canSkipTrailer && styles.skipButtonDisabled]}
                disabled={!canSkipTrailer}
                onPress={async () => {
                  if (currentTurn) {
                    const optimistic = { ...currentTurn, placed_interval: -1 };
                    currentTurnRef.current = optimistic;
                    setLocalTurn(optimistic);
                    await db.from('turns').update({ placed_interval: -1 }).eq('id', currentTurn.id);
                  }
                  setTrailerEnded(true);
                }}
              >
                <Text style={styles.knowItBtnText}>I know it! →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.activeNoVideoTopBar}>
              <View />
              <TouchableOpacity style={styles.reportButton} onPress={() => setShowReportDialog(true)}>
                <Text style={styles.reportButtonText}>⚑ Report</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}

        {/* Observer label */}
        {!amActive && showVideo && trailerRevealed && (
          <SafeAreaView style={styles.trailerControls} edges={['top']} pointerEvents="box-none">
            <View style={styles.watchingBadge}>
              <Text style={styles.watchingBadgeText}>👀 {activePlayer?.display_name} is playing</Text>
            </View>
          </SafeAreaView>
        )}

        {/* Pause overlay */}
        {amActive && showVideo && (
          <FadePauseOverlay
            visible={userPaused}
            onPress={() => { setUserPaused(false); trailerRef.current?.resume(); }}
            style={styles.pauseOverlay}
          />
        )}

        {/* Report overlay */}
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
                  <CloseIcon size={18} color={C.textMuted} />
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
        {showBetReveal && currentTurn && (
          <BetRevealOverlay
            rows={buildBetRevealRows(currentTurn, [...(timeline ?? [])].sort((a, b) => a - b))}
            revealCount={betRevealCount}
          />
        )}
      </Animated.View>

      {/* Countdown overlay — fades out when both gates open; always in tree so TrailerCountdown starts on mount */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg, opacity: countdownFadeAnim }]}
        pointerEvents={(countdownDone && trailerRevealed) ? 'none' : 'auto'}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View style={styles.gameArea}>
              <View style={[styles.timelineAreaFull, { paddingBottom: timelinePaddingBottom }]}>
                <Text style={[styles.drawingTurnLabel, { color: activePlayerColor }]}>
                  {amActive ? 'Your turn' : `${activePlayer?.display_name}'s timeline`}
                </Text>
                <View style={{ minHeight: 148 }}>
                  {movie && (
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
              </View>
            </View>
            {/* Two-phase bottom indicator:
                Phase 1 — video-playing devices show a loading label while YouTube loads.
                Phase 2 — once 'playing' fires (or immediately for non-video devices), show
                           the accurate countdown keyed to TITLE_CARD_BURN. */}
            <View style={{ position: 'absolute', bottom: PULL_TAB_H + 8, left: 0, right: 0, alignItems: 'center' }}>
              {showVideo && !videoStarted ? (
                <ChoosingMovieLabel />
              ) : (
                <TrailerCountdown
                  key={videoStarted ? 'started' : 'sync'}
                  durationMs={showVideo ? TITLE_CARD_BURN : remainingPreview}
                  onExpire={() => setCountdownDone(true)}
                />
              )}
            </View>
            {myTimeline.length > 0 && (
              <MyTimelinePanel timeline={myTimeline} cards={myTimelineCards} bottomInset={insets.bottom} screenHeight={screenHeight} />
            )}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: C.inkBg, opacity: lightsOnAnim }]}
            />
          </SafeAreaView>
      </Animated.View>

      {persistentOverlays}
      </>
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
    const observerCount = players.filter(p => p.id !== currentTurn.active_player_id).length;
    const everybodyIn = observerCount > 0 && challenges.length >= observerCount && !pendingChallengers;
    const canRevealNow = everybodyIn;
    const myPlayerObj = players.find(p => p.id === myPlayerId);
    const hasCoins = (myPlayerObj?.coins ?? 0) > 0;

    // Picking: only when it's my turn in the sequential phase and I haven't confirmed yet
    const isPickingInterval = !amActive && isMyTurnToPick && !challengeConfirmed && allDecided;

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

    // Status badge: shown as a floating label inside the timeline, no layout impact
    let badgeText: string | null = null;
    if (amActive) {
      badgeText = (pendingChallengers || !everybodyIn) ? 'Waiting for others to decide…' : canRevealNow ? 'Revealing…' : 'All decided';
    } else if (isPickingInterval) {
      badgeText = '↑  Tap a gap to place your coin';
    } else if (!inSeqPhase && myChallenge?.interval_index === -1) {
      badgeText = '⚡ You challenged!  Waiting for others…';
    } else if (inSeqPhase && myChallenge !== null && myChallenge.interval_index >= 0 && !isPickingInterval) {
      badgeText = 'Coin placed.  Waiting for others…';
    } else if (myChallenge?.interval_index === -3) {
      badgeText = 'You withdrew.';
    }
    // Keep panel open until the player has decided — don't hide early just because
    // other players filled the challenger slots (inSeqPhase).
    const showChallengePanel = !amActive && !alreadyDecided;

    return (
      <>
      <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
        <View style={styles.gameArea}>
          <Animated.View style={[styles.timelineAreaFull, { paddingBottom: timelinePaddingBottom }]}>
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
              dark={false}
              hideFloatingCard
            />
            {badgeText && (
              <View style={[styles.challengeBadge, badgeText.includes('Waiting') && styles.challengeBadgeRow]} pointerEvents="none">
                {badgeText.includes('Waiting') && (
                  <Image source={lcHourglass} style={styles.waitingHourglassIcon} tintColor='rgba(255,255,255,0.7)' />
                )}
                <Text style={styles.challengeBadgeText}>{badgeText}</Text>
              </View>
            )}
          </Animated.View>

          {/* Challenge/Pass row — in normal flow so timeline is never covered */}
          {showChallengePanel && (
            <Animated.View style={[styles.challengeBottomPanel, { transform: [{ translateY: challengePanelY }], paddingBottom: insets.bottom || 10 }]}>
              <HourglassTimer durationMs={10000} onExpire={handlePass} size={36} />
              <TouchableOpacity onPress={handlePass} activeOpacity={0.7} style={styles.passBtn}>
                <Text style={styles.passBtnLabel}>Pass</Text>
              </TouchableOpacity>
              {canChallenge ? (
                <TouchableOpacity
                  style={[styles.challengeBtn, !hasCoins && styles.challengeBtnDisabled]}
                  onPress={hasCoins ? handleChallenge : undefined}
                  activeOpacity={hasCoins ? 0.8 : 1}
                >
                  <Text style={styles.challengeBtnText}>
                    {hasCoins ? '⚡  Challenge' : 'No coins'}
                  </Text>
                  <Text style={[styles.challengeBtnSub, !hasCoins && { opacity: 0 }]}>1 coin</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.challengeBtn, styles.challengeBtnDisabled]}>
                  <Text style={styles.challengeBtnText}>All spots taken</Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Picking-phase row: hourglass + optional withdraw — in normal flow */}
          {isPickingInterval && (
            <View style={[styles.challengePickRow, { paddingBottom: insets.bottom || 10 }]}>
              <HourglassTimer durationMs={15000} size={36} onExpire={handlePickerTimeout} />
              {!amFirstChallenger && (
                <TouchableOpacity style={styles.withdrawOverlayBtn} onPress={handleWithdrawChallenge} activeOpacity={0.7}>
                  <Text style={styles.withdrawOverlayBtnText}>↩  Withdraw</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {myTimeline.length > 0 && (
          <MyTimelinePanel timeline={myTimeline} cards={myTimelineCards} bottomInset={insets.bottom} screenHeight={screenHeight} />
        )}
      </SafeAreaView>
      {persistentOverlays}
      </>
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
    // For the challenger insert animation: the DB already has the won card's year in
    // winnerTimeline, but we need to pass the timeline WITHOUT it so the insert animation
    // has a clean gap to land in (otherwise the card appears as a duplicate static card
    // right next to the animation slot, making the animation invisible).
    const winnerTimelineWithoutCard = winnerTimeline.filter((y, i, arr) => i !== arr.indexOf(m.year));
    // For active-player wins: use their actual placed_interval (they chose the slot).
    // For challenger wins: compute where the year falls in the challenger's own timeline
    // (without the card so the gap index is correct).
    // For trash: use placed_interval (shows where the active player put it).
    const revealInterval = (winnerPlayer && winnerId !== currentTurn.active_player_id)
      ? computeCorrectInterval(m.year, winnerTimelineWithoutCard)
      : currentTurn.placed_interval;

    // During flip: active player's timeline + placed_interval
    // During result before switch: still active player's timeline (so everyone sees the wrong placement)
    // After showChallengerTimeline: challenger's timeline minus the won card (insert animation fills the gap)
    const showWinnerView = revealPhase === 'result' && (showChallengerTimeline || activeCorrect);
    const displayTimeline = showWinnerView
      ? (showChallengerTimeline && winningChallenger ? winnerTimelineWithoutCard : winnerTimeline)
      : timeline;
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


    const challengersForOverlay = [...challenges]
      .filter(c => c.interval_index >= 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const revealChallengerPlacements = challengersForOverlay.map(c => ({
      interval: c.interval_index,
      label: getPlayer(c.challenger_id)?.display_name ?? '?',
    }));

    const subLines: string[] = [];
    if (winningChallenger) subLines.push(`Card moves to ${getPlayer(winningChallenger.challenger_id)?.display_name}'s timeline`);
    if (coinBackNames.length > 0) subLines.push(`${coinBackNames.join(', ')} also had it right`);
    if (didSubmitBonus) subLines.push(gotBonusCoin ? '+1 bonus coin! Movie + director correct' : 'No bonus coin — movie or director wrong');

    const revealIcon = activeCorrect ? '🎯' : winningChallenger ? '⚡' : '🗑️';

    return (
      <>
      <SafeAreaView style={[styles.container, { backgroundColor: revealBgDark ? C.inkBg : C.bg }]} edges={['top', 'bottom']}>
        <View style={styles.gameArea}>
          <Animated.View style={[styles.timelineAreaFull, { paddingBottom: timelinePaddingBottom, opacity: timelineFade }]}>
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
              revealingMovie={revealPhase !== 'suspense' ? m : undefined}
              insertDelay={showChallengerTimeline && revealPhase !== 'suspense' ? 700 : undefined}
              trashAfter={(isTrash || (!!winningChallenger && !showChallengerTimeline)) && revealPhase === 'result' ? 1200 : undefined}
              challengerPlacements={revealPhase !== 'suspense' && !showChallengerTimeline ? revealChallengerPlacements : []}
            />
          </Animated.View>
          {showChallengerTimeline && winnerPlayer && (
            <Animated.View
              pointerEvents="none"
              style={[styles.revealTimelineOwnerBadge, { opacity: timelineFade }]}
            >
              <Text style={styles.revealTimelineOwner}>
                {winnerPlayer.display_name}'s timeline
              </Text>
            </Animated.View>
          )}
          {/* Challenger name overlay — shown during the cross-fade between timelines */}
          {revealPhase === 'result' && winningChallenger && !activeCorrect && (
            <Animated.View
              pointerEvents="none"
              style={[styles.challengerTransitionOverlay, { opacity: challengerTransitionOpacity }]}
            >
              <Text style={styles.challengerTransitionName}>
                {getPlayer(winningChallenger.challenger_id)?.display_name}
              </Text>
              <Text style={styles.challengerTransitionSub}>took the card</Text>
            </Animated.View>
          )}
          {revealPhase === 'result' && (
            <RevealResult
              icon={revealIcon}
              resultName={resultName}
              resultText={resultText}
              subLines={subLines}
              onNext={handleNextTurnWithFade}
              showNext={amActive}
              nextPending={nextTurnPending}
              waitingForName={!amActive ? activePlayer?.display_name : undefined}
            />
          )}
        </View>
        {myTimeline.length > 0 && (
          <MyTimelinePanel timeline={revealMyTimeline} cards={myTimelineCards} bottomInset={insets.bottom} screenHeight={screenHeight} />
        )}
        {/* Suspense overlay — full-screen, covers chips + panel */}
        {revealPhase !== 'result' && (
          <SuspenseOverlay
            challengers={challengersForOverlay}
            getPlayer={getPlayer}
            activePlacedInterval={currentTurn.placed_interval}
            activePlayerName={activePlayer?.display_name ?? ''}
            placedMovies={revealPlacedMovies}
            extraDelay={EXTRA_SUSPENSE_MS}
          />
        )}
        <ConfettiBurst trigger={winnerId === myPlayerId && revealPhase === 'result'} />
        {/* Lights-out overlay — fades 0→1 when handleNextTurnWithFade fires; persists into drawing phase. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: C.inkBg, opacity: lightsOnAnim }]}
        />
      </SafeAreaView>
      {persistentOverlays}
      </>
    );
  }

  return <LoadingScreen />;
}

const PLAYER_CHIP_COLORS = ['#E8372A','#54B0D9','#F5C518','#8B5CF6','#10B981','#F97316','#EC4899','#6366F1'];

function PlayerChips({ players, myId, topInset, hasCastFab }: { players: Player[]; myId: string | null; topInset: number; hasCastFab: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // When castFab is present (right: 20, 34px tall, top: topInset+14), shift chips below it
  const topOffset = topInset + (hasCastFab ? 56 : 8);

  return (
    <>
      {expandedId && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
          onPress={() => setExpandedId(null)}
          activeOpacity={1}
        />
      )}
      <View style={[styles.playerChipsWrap, { top: topOffset }]}>
        {players.map((p, i) => {
          const color = PLAYER_CHIP_COLORS[i % PLAYER_CHIP_COLORS.length];
          const isMe = p.id === myId;
          const isExpanded = expandedId === p.id;
          const initial = (p.display_name ?? '?')[0].toUpperCase();
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => setExpandedId(isExpanded ? null : p.id)}
              activeOpacity={0.85}
              style={[
                styles.playerChip,
                { backgroundColor: color },
                isMe && { borderWidth: 2, borderColor: '#fff' },
                isExpanded && styles.playerChipExpanded,
              ]}
            >
              {isExpanded ? (
                <>
                  <Text style={styles.playerChipPillText} numberOfLines={1}>{p.display_name}</Text>
                  <Text style={styles.playerChipPillStat}>{p.timeline.length} cards</Text>
                  <Image source={lcCoin} style={{ width: 12, height: 12 }} />
                  <Text style={styles.playerChipPillStat}>{p.coins}</Text>
                </>
              ) : (
                <Text style={styles.playerChipInitial}>{initial}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const PULL_TAB_H = 44;

function MyTimelinePanel({ timeline, cards, bottomInset, screenHeight }: {
  timeline: number[];
  cards: (Movie | undefined)[];
  bottomInset: number;
  screenHeight: number;
}) {
  const maxHeight = screenHeight * 0.5;
  const translateY = useRef(new Animated.Value(maxHeight)).current;
  const panelOpenRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const CARD_W = 80, CARD_H = 100;

  const open = () => {
    panelOpenRef.current = true;
    setIsOpen(true);
    Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 180, useNativeDriver: true }).start();
  };
  const close = () => {
    panelOpenRef.current = false;
    Animated.timing(translateY, { toValue: maxHeight, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setIsOpen(false));
  };

  const dragResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
    onPanResponderMove: (_, gs) => {
      if (gs.dy > 0) translateY.setValue(gs.dy);
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 60 || gs.vy > 0.6) close();
      else Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 180, useNativeDriver: true }).start();
    },
  })).current;

  return (
    <>
      {/* Small centered pull tab — visible when closed, non-intrusive */}
      {!isOpen && (
        <TouchableOpacity
          style={[styles.myTimelinePullTab, { bottom: bottomInset }]}
          onPress={open}
          activeOpacity={0.85}
        >
          <View style={styles.myTimelinePullHandle} />
          <Text style={styles.myTimelinePullLabel}>My Timeline</Text>
        </TouchableOpacity>
      )}

      {/* Backdrop */}
      {isOpen && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 19, backgroundColor: 'rgba(0,0,0,0.4)' }]}
          activeOpacity={1}
          onPress={close}
        />
      )}

      {/* Full-width panel — slides up from bottom when open */}
      {isOpen && (
        <Animated.View
          style={[styles.myTimelinePanelWrap, { height: maxHeight, transform: [{ translateY }], zIndex: 20 }]}
          {...dragResponder.panHandlers}
        >
          {/* Drag handle + close */}
          <TouchableOpacity style={styles.myTimelinePanelHeader} onPress={close} activeOpacity={0.85}>
            <View style={styles.myTimelinePullHandle} />
          </TouchableOpacity>
          {/* Cards */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.myTimelinePanelScroll, { paddingBottom: bottomInset + 8 }]}
          >
            {timeline.map((year, i) => {
              const mv = cards[i];
              return mv
                ? <CardFront key={i} movie={mv} width={CARD_W} height={CARD_H} />
                : <View key={i} style={[styles.myTimelinePanelYearCard, { width: CARD_W, height: CARD_H }]}>
                    <Text style={styles.myTimelinePanelYearText}>{year}</Text>
                  </View>;
            })}
          </ScrollView>
        </Animated.View>
      )}
    </>
  );
}

function LoadingScreen() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.inkBg, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={C.ochre} />
    </View>
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
            <Image source={lcTrophy} style={{ width: 96, height: 96, resizeMode: 'contain' }} />
          </Animated.View>

          <Text style={styles.gameOverLabel}>GAME OVER</Text>
          <Text style={styles.gameOverWinner}>
            {isMe ? 'You win!' : `${winner.display_name} wins!`}
          </Text>
          <Text style={styles.gameOverCards}>
            {Math.min(winner.timeline.length, WIN_CARDS)} cards collected
          </Text>

          <TouchableOpacity style={[styles.revealNextBtn, { marginTop: 8, alignSelf: 'stretch' }]} onPress={() => router.replace('/')} activeOpacity={0.85}>
            <Text style={styles.revealNextBtnText}>Back to Home</Text>
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
      <ConfettiBurst trigger={isMe} />
    </SafeAreaView>
  );
}

// ── Suspense overlay (shown at start of revealing phase) ─────────────────────

function getIntervalLabel(idx: number | null, placedMovies: { year: number }[]): string {
  if (idx === null || idx === undefined || idx < 0) return '?';
  if (placedMovies.length === 0) return `gap ${idx + 1}`;
  if (idx === 0) return `before ${placedMovies[0].year}`;
  if (idx >= placedMovies.length) return `after ${placedMovies[placedMovies.length - 1].year}`;
  return `${placedMovies[idx - 1].year} – ${placedMovies[idx].year}`;
}

const MAX_SUSPENSE_CHALLENGERS = 8;

function SuspenseOverlay({
  challengers,
  getPlayer,
  activePlacedInterval,
  activePlayerName,
  placedMovies,
  extraDelay = 0,
}: {
  challengers: { id: string; challenger_id: string; interval_index: number }[];
  getPlayer: (id: string | null) => { display_name: string } | null;
  activePlacedInterval: number | null;
  activePlayerName: string;
  placedMovies: { year: number }[];
  extraDelay?: number;
}) {
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const countScale = useRef(new Animated.Value(0.82)).current;
  const activePlacementAnim = useRef(new Animated.Value(0)).current;
  const nameAnims = useRef(
    Array.from({ length: MAX_SUSPENSE_CHALLENGERS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Slow "lights going out" bg fade (700ms), then content reveals once dark
    Animated.timing(bgOpacity, { toValue: 0.95, duration: 700, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(750),
      Animated.parallel([
        Animated.timing(countAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(activePlacementAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(countScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 80 }),
      ]),
    ]).start();
    challengers.slice(0, MAX_SUSPENSE_CHALLENGERS).forEach((_, i) => {
      Animated.sequence([
        Animated.delay(950 + i * 200),
        Animated.timing(nameAnims[i], { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    });
    // Fade out 350ms before the flip phase (3400ms + extraDelay)
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(countAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 2900 + extraDelay);
    return () => clearTimeout(t);
  }, []);

  const count = challengers.length;
  const activeLabel = getIntervalLabel(activePlacedInterval, placedMovies);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#07041a', opacity: bgOpacity }]} />
      <Animated.View style={[styles.suspenseContent, { opacity: countAnim }]}>
        {/* Active player's pick — appears with the count */}
        <Animated.View style={[styles.suspenseBetRow, { opacity: activePlacementAnim }]}>
          <Text style={styles.suspenseBetName}>{activePlayerName}</Text>
          <Text style={styles.suspenseBetDot}>·</Text>
          <Text style={styles.suspenseBetInterval}>{activeLabel}</Text>
        </Animated.View>
        <View style={styles.suspenseDivider} />
        <Animated.Text style={[styles.suspenseCount, { transform: [{ scale: countScale }] }]}>
          {count === 0 ? 'No challengers' : count === 1 ? '1 challenger' : `${count} challengers`}
        </Animated.Text>
        <Text style={styles.suspenseSubLabel}>
          {count === 0 ? '— revealing now' : '— let\'s see who\'s right'}
        </Text>
        {challengers.slice(0, MAX_SUSPENSE_CHALLENGERS).map((c, i) => (
          <Animated.View key={c.id} style={[styles.suspenseBetRow, { opacity: nameAnims[i] }]}>
            <Text style={styles.suspenseBetName}>{getPlayer(c.challenger_id)?.display_name ?? '?'}</Text>
            <Text style={styles.suspenseBetDot}>·</Text>
            <Text style={styles.suspenseBetInterval}>{getIntervalLabel(c.interval_index, placedMovies)}</Text>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

// ── Reveal result banner (slides up from bottom) ─────────────────────────────

function RevealResult({
  icon,
  resultName,
  resultText,
  subLines,
  onNext,
  showNext,
  nextPending,
  waitingForName,
}: {
  icon: string;
  resultName: string;
  resultText: string;
  subLines: string[];
  onNext: () => void;
  showNext: boolean;
  nextPending: boolean;
  waitingForName?: string;
}) {
  const slideAnim = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 9,
      tension: 70,
    }).start();
  }, []);

  const iconNode = icon === '🎯'
    ? <Image source={lcStarburst} style={styles.resultBannerIconImg} />
    : icon === '⚡'
    ? <Image source={lcLightning} style={styles.resultBannerIconImg} />
    : <Text style={styles.resultBannerIconEmoji}>{icon}</Text>;

  return (
    <Animated.View style={[styles.resultBanner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.resultBannerRow}>
        {iconNode}
        <View style={styles.resultBannerText}>
          {resultName ? (
            <>
              <Text style={styles.resultBannerName} numberOfLines={1}>{resultName}</Text>
              <Text style={styles.resultBannerVerb}>{resultText}</Text>
            </>
          ) : (
            <Text style={styles.resultBannerVerb}>{resultText}</Text>
          )}
          {subLines.length > 0 && (
            <Text style={styles.resultBannerSub} numberOfLines={1}>{subLines[0]}</Text>
          )}
        </View>
        {showNext ? (
          <TouchableOpacity style={styles.resultBannerBtn} onPress={onNext} activeOpacity={0.85} disabled={nextPending}>
            {nextPending
              ? <ActivityIndicator size="small" color={C.textSub} />
              : <Text style={styles.resultBannerBtnText}>Next round →</Text>}
          </TouchableOpacity>
        ) : (
          <Text style={styles.resultBannerWaiting}>
            {waitingForName ? `Waiting for ${waitingForName}…` : ''}
          </Text>
        )}
      </View>
    </Animated.View>
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


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.inkBg },

  // ── Drawing phase ──
  drawingTopSection: {
    flex: 1,
    paddingTop: 16,
  },
  drawingTurnLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.lg,
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.9,
    marginBottom: 8,
  },
  drawingWaitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  drawingWaitingText: {
    color: C.textSub,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    textAlign: 'center',
  },
  waitingHourglassIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
  drawingMySection: {
    maxHeight: 110,
    paddingTop: 4,
  },
  drawingMySectionLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: Fonts.label,
    fontSize: FS.micro,
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
  bigTurnText: { color: C.textPrimaryDark, fontFamily: Fonts.display, fontSize: FS['2xl'], textAlign: 'center' },
  waitingText: { color: C.textSubDark, fontFamily: Fonts.body, fontSize: FS.lg, textAlign: 'center' },
  timelineOwnerLabel: { color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.sm, textAlign: 'center', marginBottom: 4 },
  avatarLarge: {
    width: 72, height: 72, borderRadius: R.full,
    backgroundColor: C.ochre, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.ink,
  },
  avatarLargeText: { color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.xl, lineHeight: FS.xl, includeFontPadding: false },
  primaryBtn: { backgroundColor: C.ochre, borderRadius: R.btn, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 24, paddingVertical: 10 },
  primaryBtnText: { color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.md },
  phaseLabel: { color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.base, textAlign: 'center' },
  tapHint: { color: C.textMutedDark, fontFamily: Fonts.label, fontSize: FS.sm, textAlign: 'center', marginTop: 4, minHeight: 32 },

  gameArea: {
    flex: 1,
    overflow: 'hidden',
  },
  timelineAreaFull: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 48,
  },

  placePromptRow: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  placePrompt: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    textAlign: 'center',
    zIndex: 1,
  },
  placePromptText: {
    color: C.textSub,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  placingBottomStrip: {
    backgroundColor: C.inkSurface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placingStripText: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    textAlign: 'center',
  },
  challengeBottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  challengePickRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 16,
  },
  passBtn: {
    flex: 1,
    borderRadius: R.btn,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderWidth: 2,
    borderColor: C.borderLight,
  },
  passBtnLabel: {
    color: C.textSub,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  challengeBtn: {
    flex: 2,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.vermillion,
  },
  challengeBtnDisabled: {
    backgroundColor: 'rgba(232,55,42,0.2)',
  },
  challengeBtnText: {
    color: '#fff',
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    letterSpacing: 0.3,
  },
  challengeBtnSub: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    marginTop: 2,
  },
  // Keep these for the pass button in seq/withdraw
  passTextBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  passTextBtnText: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  challengeStatusStrip: {
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  challengeStatusStripText: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    textAlign: 'center',
  },
  placingLabel: {
    textAlign: 'center',
  },
  challengeBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  challengeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  challengeBadgeText: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    textAlign: 'center',
  },
  withdrawOverlayBtn: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  withdrawOverlayBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  watchingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: R.btn,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 12,
  },
  watchingBadgeText: { color: 'rgba(255,255,255,0.6)', fontFamily: Fonts.label, fontSize: FS.sm },
  endedWaiting: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.md,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 40,
  },

  passBtnText: { color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.sm },
  revealNowBtn: {
    width: '100%',
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.ochre,
  },
  revealNowBtnText: { color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.sm },

  // ── Revealing phase ──
  revealTimelineOwnerBadge: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  revealTimelineOwner: {
    color: C.ochre,
    fontFamily: Fonts.label,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 0.85,
    paddingBottom: 4,
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
  suspenseBetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  suspenseBetName: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.xl,
    opacity: 0.9,
  },
  suspenseBetDot: {
    color: C.ochre,
    opacity: 0.5,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  suspenseBetInterval: {
    color: C.ochre,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  suspenseDivider: {
    width: 48,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 6,
  },

  // ── Reveal result banner ──
  resultBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.inkSurface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultBannerIconImg: { width: 26, height: 26, resizeMode: 'contain' },
  resultBannerIconEmoji: { fontSize: 22 },
  resultBannerText: { flex: 1, gap: 1 },
  resultBannerName: {
    color: C.ochre,
    fontFamily: Fonts.display,
    fontSize: FS.base,
    letterSpacing: 0.2,
  },
  resultBannerVerb: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.body,
    fontSize: FS.xs,
  },
  resultBannerSub: {
    color: 'rgba(255,255,255,0.40)',
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    marginTop: 1,
  },
  resultBannerBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resultBannerBtnText: { color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.sm, letterSpacing: 0.3 },
  resultBannerCountdown: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  resultBannerCountdownText: { color: 'rgba(255,255,255,0.55)', fontFamily: Fonts.bodyBold, fontSize: FS.sm },
  resultBannerWaiting: { color: 'rgba(255,255,255,0.55)', fontFamily: Fonts.body, fontSize: FS.xs, textAlign: 'center' },
  challengerTransitionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  challengerTransitionName: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: 28,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  challengerTransitionSub: {
    color: C.ochre,
    fontFamily: Fonts.label,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.85,
  },
  // Used by GameOverScreen
  revealNextBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 14,
    alignItems: 'center',
  },
  revealNextBtnText: { color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.md, letterSpacing: 0.4 },

  // ── Trailer overlay ──
  trailerControls: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'flex-end', justifyContent: 'space-between', padding: 16,
    zIndex: 20,
  },
  cornerActions: { alignItems: 'flex-end', gap: 10 },
  reportButton: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: R.btn, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reportButtonText: { color: 'rgba(255,255,255,0.65)', fontFamily: Fonts.label, fontSize: FS.sm },
  skipButton: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: R.card, backgroundColor: C.ochre,
    borderWidth: 2, borderColor: C.ink,
  },
  skipButtonText: { color: C.textOnOchre, fontFamily: Fonts.bodyBold, fontSize: FS.md, letterSpacing: 0.4 },
  skipButtonDisabled: { opacity: 0.4 },
  // Active player in private game — no video, centered layout
  activeNoVideoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between',
    padding: 16,
  },
  activeNoVideoTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeNoVideoCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  knowItBtn: {
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: R.card,
    backgroundColor: C.ochre,
    borderWidth: 2,
    borderColor: C.ink,
  },
  knowItBtnText: {
    color: C.textOnOchre,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.xl,
    letterSpacing: 0.5,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  pauseIcon: { color: '#fff', fontSize: 72, opacity: 0.9 },

  // ── Ended screen ──
  endedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 20 },
  endedInner: { flex: 1, justifyContent: 'space-between', padding: 20 },
  endedCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  endedTitle: { color: C.textPrimaryDark, fontFamily: Fonts.display, fontSize: 32, textAlign: 'center', letterSpacing: 1 },
  endedTitleIcon: { width: 72, height: 72, resizeMode: 'contain' },
  endedSubtitle: {
    color: C.ochre, fontFamily: Fonts.label, fontSize: FS.sm, textAlign: 'center',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  endedActions: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingBottom: 16 },
  actionButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: R.card },
  replayButton: {
    backgroundColor: C.inkSurface, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  replayButtonText: { color: C.textPrimaryDark, fontFamily: Fonts.bodyBold, fontSize: FS.md, letterSpacing: 0.3 },
  nextButton: { backgroundColor: C.ochre, borderWidth: 2, borderColor: C.ink },
  nextButtonText: { color: C.textOnOchre, fontFamily: Fonts.bodyBold, fontSize: FS.md + 1, letterSpacing: 0.3 },

  // ── Report modal ──
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: 20, paddingHorizontal: 52,
  },
  reportSheet: { backgroundColor: C.surface, borderRadius: R.card, overflow: 'hidden', width: '100%', maxWidth: 640 },
  reportHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 2, borderBottomColor: C.inkFaint,
  },
  reportTitle: { color: C.textPrimary, fontFamily: Fonts.bodyBold, fontSize: FS.md },
  reportCloseBtn: { padding: 4 },
  reportCloseText: { color: C.textMuted, fontFamily: Fonts.label, fontSize: FS.md },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  reportOption: {
    width: '50%', paddingVertical: 13, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
  },
  reportOptionText: { color: C.textSub, fontFamily: Fonts.body, fontSize: FS.sm, lineHeight: 18 },
  snack: { backgroundColor: C.surface, marginBottom: 16 },

  // ── PlayerChips ──
  playerChipsWrap: {
    position: 'absolute', right: 8, zIndex: 11,
    flexDirection: 'column', alignItems: 'flex-end', gap: 4,
  },
  playerChip: {
    flexDirection: 'row', alignItems: 'center',
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', overflow: 'hidden',
  },
  playerChipExpanded: {
    width: 'auto', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, gap: 5,
  },
  playerChipInitial: { color: '#fff', fontFamily: Fonts.bodyBold, fontSize: FS.sm },
  playerChipPillText: { color: '#fff', fontFamily: Fonts.bodyBold, fontSize: FS.sm, maxWidth: 80 },
  playerChipPillStat: { color: 'rgba(255,255,255,0.75)', fontFamily: Fonts.label, fontSize: FS.xs },

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
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    textAlign: 'center',
  },
  leaveBody: {
    color: C.textSub,
    fontFamily: Fonts.body,
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
    borderWidth: 2,
    borderColor: C.inkFaint,
    backgroundColor: C.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveExitText: {
    color: C.textSub,
    fontFamily: Fonts.label,
    fontSize: FS.base,
  },
  leaveStayBtn: {
    flex: 2,
    height: 48,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    backgroundColor: C.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveStayText: {
    color: C.textOnOchre,
    fontFamily: Fonts.display,
    fontSize: FS.base,
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
  myTimelineTitle: { color: C.textPrimary, fontFamily: Fonts.bodyBold, fontSize: FS.lg },
  myTimelineEmpty: { color: C.textMuted, fontFamily: Fonts.body, fontSize: FS.base, textAlign: 'center', paddingVertical: 16 },
  myTimelineScroll: { gap: 8, paddingVertical: 4 },
  myTimelinePlaceholder: {
    width: 90, height: 126, backgroundColor: C.surfaceHigh,
    borderRadius: R.md, borderWidth: 2, borderColor: C.inkFaint,
    alignItems: 'center', justifyContent: 'center',
  },
  myTimelinePlaceholderYear: { color: C.ochre, fontFamily: Fonts.bodyBold, fontSize: FS.md },

  // Bonus coin guess inputs (trailerEnded screen)
  bonusCoinBox: {
    alignItems: 'stretch', gap: 8, marginTop: 12, width: '100%', paddingHorizontal: 16,
  },
  bonusCoinHint: {
    color: C.ochre, fontFamily: Fonts.label, fontSize: FS.xs,
    textAlign: 'center', letterSpacing: 0.5, textTransform: 'uppercase',
  },
  guessInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  guessInputIcon: {
    width: 28, height: 28, resizeMode: 'contain',
  },
  guessInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 12,
    color: C.textPrimaryDark, fontFamily: Fonts.body, fontSize: FS.base,
  },

  // ── Bonus overlay (FAB popup) ──
  bonusOverlay: {
    position: 'absolute', right: 20, width: 220,
    backgroundColor: C.inkSurface,
    borderRadius: R.sheet,
    borderWidth: 1.5, borderColor: C.ochre,
    elevation: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.4, shadowRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    gap: 8,
  },
  bonusOverlayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bonusOverlayTitle: { color: C.ochre, fontFamily: Fonts.label, fontSize: FS.xs, letterSpacing: 1.5, textTransform: 'uppercase' },
  bonusOverlayActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bonusOverlayReplayBtn: { paddingVertical: 2 },
  bonusOverlayReplayText: { color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.sm },
  bonusInputsStack: { gap: 6 },
  bonusInputDirectorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bonusInput: {
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: R.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    color: C.textPrimaryDark, fontFamily: Fonts.body, fontSize: FS.sm,
  },
  bonusMicBtn: {
    width: 34, height: 34, borderRadius: R.sm,
    backgroundColor: 'rgba(245,197,24,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,197,24,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  bonusMicIcon: { fontSize: 16 },
  bonusVoiceRecordColumn: {
    alignItems: 'center', gap: 10, paddingVertical: 6,
  },
  bonusVoiceResultStack: {
    gap: 6,
  },
  bonusVoiceResultTitle: {
    color: C.textPrimaryDark, fontFamily: Fonts.bodyBold, fontSize: FS.sm,
  },
  bonusVoiceResultSub: {
    color: C.textSubDark, fontFamily: Fonts.body, fontSize: FS.sm,
    marginBottom: 2,
  },
  bonusVoiceResultBtns: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  bonusVoiceRetryBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  bonusVoiceRetryText: { color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.sm },
  bonusVoiceAcceptBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: R.sm, backgroundColor: C.ochre,
    alignItems: 'center',
  },
  bonusVoiceAcceptText: { color: C.textOnOchre, fontFamily: Fonts.bodyBold, fontSize: FS.sm },
  bonusInputPlaceholder: { color: C.textMutedDark, fontFamily: Fonts.body, fontSize: FS.sm },
  // ── Bonus FAB ──
  bonusFabColumn: {
    position: 'absolute', right: 20,
    flexDirection: 'column-reverse', alignItems: 'flex-end', gap: 8,
  },
  bonusFabMainRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  bonusFabTip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.inkSurface,
    borderRadius: R.full, borderWidth: 1, borderColor: 'rgba(245,197,24,0.3)',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  bonusFabTipText: {
    color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.xs,
  },
  bonusFabTipArrow: {
    color: C.ochre, fontFamily: Fonts.bodyBold, fontSize: FS.sm,
  },
  bonusFab: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.inkSurface,
    borderWidth: 2, borderColor: C.ochre,
    alignItems: 'center', justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6,
  },
  bonusFabDone: { borderColor: C.leaf, backgroundColor: 'rgba(61,170,92,0.15)' },
  bonusFabIcon: { width: 24, height: 24, resizeMode: 'contain' },
  bonusFabCheck: { color: C.leaf, fontFamily: Fonts.bodyBold, fontSize: FS.md, includeFontPadding: false },
  voiceMicBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: R.card,
    backgroundColor: 'rgba(245,197,24,0.07)',
    borderWidth: 2, borderColor: 'rgba(245,197,24,0.4)',
  },
  voiceMicIcon: { fontSize: 22 },
  voiceRecordingView: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14,
  },
  waveformRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  waveformBar: {
    width: 3, height: 44, borderRadius: 2, backgroundColor: C.gold,
  },
  voiceStopBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(230,57,70,0.12)',
    borderWidth: 1.5, borderColor: '#e63946',
    alignItems: 'center', justifyContent: 'center',
  },
  voiceStopSquare: {
    width: 14, height: 14, borderRadius: 3, backgroundColor: '#e63946',
  },
  voiceMicText: {
    color: C.ochre, fontFamily: Fonts.bodyBold, fontSize: FS.base,
  },
  voiceErrorBox: {
    backgroundColor: 'rgba(232,55,42,0.08)',
    borderWidth: 2, borderColor: 'rgba(232,55,42,0.35)',
    borderRadius: R.sm, padding: 14, gap: 8, alignItems: 'center',
  },
  voiceErrorText: {
    color: C.textSubDark, fontFamily: Fonts.body, fontSize: FS.sm, textAlign: 'center', lineHeight: 18,
  },
  voiceRetryText: {
    color: C.ochre, fontFamily: Fonts.bodyBold, fontSize: FS.sm,
  },
  voiceUnavailableText: {
    color: C.textMutedDark, fontFamily: Fonts.body, fontSize: FS.sm, textAlign: 'center',
  },
  guessPlaceBtn: {
    flex: 1, height: 52, backgroundColor: C.ochre, borderRadius: R.card,
    borderWidth: 2, borderColor: C.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  guessPlaceText: {
    color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.md, letterSpacing: 0.4,
  },
  guessResultLabel: {
    color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.xs,
    letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 4,
  },
  guessResultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: R.card, paddingHorizontal: 20, paddingVertical: 16,
  },
  guessResultIcon: { fontSize: 22 },
  guessResultText: { flex: 1, color: C.textPrimaryDark, fontFamily: Fonts.bodyBold, fontSize: FS.lg },
  guessRetryBtn: {
    flex: 1, height: 52, borderRadius: R.card,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  guessRetryText: { color: C.textSubDark, fontFamily: Fonts.label, fontSize: FS.base },


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
    borderRightWidth: 2,
    borderRightColor: 'rgba(255,255,255,0.10)',
  },
  gameOverRight: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  gameOverLabel: {
    color: C.ochre,
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  gameOverWinner: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  gameOverCards: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.sm,
  },
  gameOverLeaderboard: {
    gap: 6,
  },
  gameOverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inkSurface,
    borderRadius: R.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  gameOverRowMe: {
    borderWidth: 2,
    borderColor: C.ochre,
    backgroundColor: 'rgba(245,197,24,0.08)',
  },
  gameOverRank: {
    color: C.textMutedDark,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
    width: 18,
    textAlign: 'center',
  },
  gameOverPlayerName: {
    flex: 1,
    color: C.textPrimaryDark,
    fontFamily: Fonts.label,
    fontSize: FS.base,
  },
  gameOverPlayerCards: {
    color: C.ochre,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.base,
  },
  // ── MyTimelinePanel ──
  // Closed state: small centered tab at bottom edge (non-intrusive)
  myTimelinePullTab: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'column', alignItems: 'center', gap: 2,
    paddingHorizontal: 24, paddingTop: 5, paddingBottom: 4,
    backgroundColor: 'rgba(20,20,22,0.92)',
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.18)',
    borderTopLeftRadius: R.md, borderTopRightRadius: R.md,
    zIndex: 20,
  },
  myTimelinePullHandle: {
    width: 32, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 1,
  },
  myTimelinePullLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: Fonts.label,
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Open state: full-width panel
  myTimelinePanelWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surfaceHigh,
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: C.ink,
  },
  myTimelinePanelHeader: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  myTimelinePanelScroll: {
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  myTimelinePanelYearCard: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myTimelinePanelYearText: {
    color: C.ochre,
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
  },
  castFab: {
    position: 'absolute', right: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  leaveChip: {
    position: 'absolute', left: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  tvDetectedBanner: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 20,
  },
  tvDetectedBannerText: {
    color: '#fff', fontFamily: Fonts.label, fontSize: 13, flex: 1,
  },
  tvDetectedBannerClose: {
    color: 'rgba(255,255,255,0.5)', fontFamily: Fonts.label, fontSize: 14, marginLeft: 12,
  },
  castSheet: {
    backgroundColor: C.surface,
    borderRadius: R.card,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    gap: 16,
  },
  castSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  castSheetTitle: {
    color: C.textPrimary,
    fontFamily: Fonts.display,
    fontSize: FS.lg,
  },
  castCloseBtn: { padding: 4 },
  castCloseBtnText: { color: C.textSub, fontFamily: Fonts.label, fontSize: 16 },
  castSheetBody: {
    color: C.textSub,
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    lineHeight: 22,
  },
  castStartBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  castStartBtnText: {
    color: C.textOnOchre,
    fontFamily: Fonts.display,
    fontSize: FS.base,
  },
  castAirPlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surfaceHigh,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.inkFaint,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  castAirPlayLabel: {
    color: C.textSub,
    fontFamily: Fonts.label,
    fontSize: FS.sm,
  },
  castAirPlayBtn: {
    width: 44,
    height: 44,
  },
});

