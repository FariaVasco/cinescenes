/**
 * Who wants to be a cinephile — single-player trivia (Phase B, core loop).
 * Landscape. Reads pre-generated questions from `trivia_questions`.
 * Core loop only: question -> select -> final answer -> reveal -> advance / lose /
 * walk away. Lifelines are rendered but wired in a later step; trailer intro later.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Animated, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { Movie } from '@/lib/database.types';
import FilmCountdown from '@/components/FilmCountdown';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import { TrailerPlayer, TrailerPlayerHandle } from '@/components/TrailerPlayer';
import * as haptics from '@/lib/haptics';

const db = supabase as unknown as { from: (t: string) => any };
const lcClapperboard = require('../assets/lc-clapperboard.png');

function shuffleArr<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// Bright ligne-claire palette (matches the rest of the app): parchment + ink strokes.
const D = {
  bg: C.bg,               // warm parchment
  panel: C.surfaceWarm,   // cream cards
  panelHi: C.surface,     // white
  line: C.ink,            // 2px ligne-claire stroke
  lineSoft: C.inkFaint,
  text: C.textPrimary,    // ink
  sub: C.textSub,
  ochre: C.ochre,
  correct: C.leaf,
  wrong: C.vermillion,
};
// A/B/C/D option badges each get one of the four brand colors.
const BADGE_COLORS = [C.ochre, C.cerulean, C.vermillion, C.leaf];

// Classic prize ladder; a run uses the first `total` rungs (total = # questions).
const PRIZES = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
const LETTERS = ['A', 'B', 'C', 'D'];
// Sprocket-hole rail down each side of the prize ladder — generously overshoots any
// real device height (40 ran out partway down on a tall Android screen, making the
// filmstrip look like it stopped arbitrarily); `ladder`'s overflow:hidden clips
// whatever's unused, so overshooting here is free.
const SPROCKET_DOTS = Array.from({ length: 120 });
const REVEAL_MS = 2800; // longer so the movie-reveal is readable
const RUN_LEN = 15;     // questions per run (random subset of the bank) — full $100 → $1,000,000 ladder

const SUSPENSE_MS = 2200;
const isSafe = (i: number, total: number) => (i + 1) % 5 === 0 || i === total - 1;
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
/** Highest safe-rung prize strictly below rung i (what you keep on a miss). */
function safeFloorBelow(i: number, total: number): number {
  for (let k = i - 1; k >= 0; k--) if (isSafe(k, total)) return PRIZES[k];
  return 0;
}

type Q = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  difficulty_band: string | null;
  difficulty_score: number | null;
  category: string;
  movie: Movie | null;
};

/** Randomize option order so the correct answer isn't always in the same slot
 * (guards against authored/LLM positional bias). Remaps correct_index. */
function withShuffledOptions(q: Q): Q {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map(i => q.options[i]),
    correct_index: order.indexOf(q.correct_index),
  };
}

const SELECT_COLS = 'id,question,options,correct_index,difficulty_band,difficulty_score,category,movies(*)';
function mapRow(r: any): Q {
  return {
    id: r.id, question: r.question, options: r.options, correct_index: r.correct_index,
    difficulty_band: r.difficulty_band, difficulty_score: r.difficulty_score ?? null,
    category: r.category, movie: r.movies ?? null,
  };
}

export default function TriviaScreen() {
  const router = useRouter();
  const tickSound = useAudioPlayer(require('../assets/sounds/countdown-tick.wav'));
  const successSound = useAudioPlayer(require('../assets/sounds/win.mp3'));
  const failSound = useAudioPlayer(require('../assets/sounds/challenge.mp3')); // placeholder — no dedicated fail sound
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(true);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [suspense, setSuspense] = useState(false);
  const [ended, setEnded] = useState<{ won: boolean; amount: number } | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspenseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  // Lifelines (each once per game)
  const [used, setUsed] = useState({ fifty: false, swap: false, second: false });
  const [hidden, setHidden] = useState<number[]>([]);   // option indices removed (50/50 or 2nd-chance elimination)
  const [secondArmed, setSecondArmed] = useState(false); // extra life active for the current question
  const [swapping, setSwapping] = useState(false);
  const [phase, setPhase] = useState<'trailer' | 'question'>('trailer'); // per-rung: watch trailer, then answer
  // Persistent background trailer. `trailerIdx` LEADS `idx`: at Final Answer it jumps to
  // the next question so that trailer burns off its YouTube title (muted) during the
  // suspense+reveal window and is clean/ready by the time we show it. `trailerRevealed`
  // gates a burn cover for when the warm window is shorter than TITLE_CARD_BURN (Q1/swap).
  const [trailerIdx, setTrailerIdx] = useState(0);
  const [trailerRevealed, setTrailerRevealed] = useState(false);
  const trailerRef = useRef<TrailerPlayerHandle>(null);
  const ladderRef = useRef<ScrollView>(null);
  const [ladderViewportH, setLadderViewportH] = useState(0);
  const [ladderContentH, setLadderContentH] = useState(0);
  // The question card, options, action row and lifelines were sized with fixed pixel
  // values tuned on an iPhone — on an Android device with less available landscape
  // height, the same fixed sizes don't all fit, and since nothing below the question
  // card could shrink, the lifelines row (and even Final Answer) got pushed off-screen
  // with no way to reach them. Measure the actual available height and scale every
  // fixed size down together so everything always fits, floored at 62% so text/tap
  // targets never get illegibly small; a ScrollView around the column is the backstop
  // for any device tight enough that even the floor doesn't fit.
  const [mainH, setMainH] = useState(0);
  // `main` and `ladder` are both cross-axis STRETCHED to `body`'s height, which is
  // itself inset from the true screen bottom by the safe-area margin — invisible on
  // `main`'s parchment side since it matches the screen's own background there, but
  // visible as a sand-colored strip under the dark ladder. A stretched (not
  // explicitly-sized) box's cross-axis size is "container size minus its own margin",
  // so a negative bottom margin here grows it past that edge by exactly the real inset.
  const insets = useSafeAreaInsets();
  const DESIGN_MAIN_H = 380;
  const scale = Math.max(0.62, mainH ? Math.min(1, mainH / DESIGN_MAIN_H) : 1);
  const sc = (px: number) => Math.round(px * scale);

  useFocusEffect(useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []));

  // Re-assert the lock at the countdown -> gameplay transition too — a single lock
  // on focus can silently fail to hold (OS flakiness resuming from background, a
  // rotation animation racing the first mount), leaving TrailerPlayer's
  // useWindowDimensions()-based sizing computed against a stale portrait window for
  // the rest of the session. Mirrors game.tsx re-locking at its loading/intro transitions.
  useEffect(() => {
    if (!countdown) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, [countdown]);

  useEffect(() => {
    (async () => {
      const { data, error } = await db
        .from('trivia_questions')
        .select(SELECT_COLS)
        .limit(200);
      if (error) { setError(error.message); setLoading(false); return; }
      const all: Q[] = (data ?? []).map((r: any) => withShuffledOptions(mapRow(r)));
      // At most one question per movie in a run — a film never repeats within a game (the
      // bank may hold several questions per movie; we pick one at random each play).
      const seenMovies = new Set<string>();
      const uniqueByMovie: Q[] = [];
      for (const item of shuffleArr(all)) {
        const key = item.movie?.id ?? item.id;
        if (seenMovies.has(key)) continue;
        seenMovies.add(key);
        uniqueByMovie.push(item);
      }
      // Round-robin across categories (not a random slice) so a run doesn't cluster
      // same-topic questions — e.g. several literal "Who directed this film?" questions
      // in one run, since that single-category generator now makes up ~20% of the bank.
      // Once a smaller category's bucket runs dry, remaining slots fall back to whatever
      // categories still have supply — this maximizes diversity given what's available
      // rather than leaving slots unfilled.
      function pickByCategory(pool: Q[], n: number): Q[] {
        const byCategory = new Map<string, Q[]>();
        for (const item of pool) {
          const key = item.category ?? 'production';
          const bucket = byCategory.get(key) ?? [];
          bucket.push(item);
          byCategory.set(key, bucket);
        }
        const categoryOrder = shuffleArr([...byCategory.keys()]);
        const out: Q[] = [];
        while (out.length < n && categoryOrder.some(c => (byCategory.get(c) ?? []).length)) {
          for (const c of categoryOrder) {
            if (out.length >= n) break;
            const bucket = byCategory.get(c);
            if (bucket?.length) out.push(bucket.shift()!);
          }
        }
        return out;
      }
      // Stratify by difficulty band FIRST, then round-robin categories within each band.
      // Category diversity alone can't guarantee an actual easy start — a random draw
      // could land mostly medium/hard "production" questions and few/no true-easy ones,
      // so the ladder's early rungs end up harder than intended even though the final
      // sort is correct for whatever got picked. Explicitly reserving slots per band
      // fixes that at the source.
      const BAND_ORDER = ['easy', 'medium', 'hard'] as const;
      const TARGET_PER_BAND = Math.floor(RUN_LEN / BAND_ORDER.length);
      const byBand = new Map<string, Q[]>();
      for (const item of uniqueByMovie) {
        const key = item.difficulty_band ?? 'medium';
        const bucket = byBand.get(key) ?? [];
        bucket.push(item);
        byBand.set(key, bucket);
      }
      const picked: Q[] = [];
      for (const band of BAND_ORDER) picked.push(...pickByCategory(byBand.get(band) ?? [], TARGET_PER_BAND));
      // A band short on supply shouldn't shrink the run — top up from whatever's left.
      if (picked.length < RUN_LEN) {
        const pickedIds = new Set(picked.map(p => p.id));
        const leftover = uniqueByMovie.filter(item => !pickedIds.has(item.id));
        picked.push(...pickByCategory(leftover, RUN_LEN - picked.length));
      }
      // Ordered easy -> hard for the ladder.
      const run = picked.sort((a, b) => (a.difficulty_score ?? 0.5) - (b.difficulty_score ?? 0.5));
      setQuestions(run);
      setLoading(false);
    })();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (suspenseTimer.current) clearTimeout(suspenseTimer.current);
      if (tickInterval.current) clearInterval(tickInterval.current);
    };
  }, []);

  // Pulse the "REVEALING…" label during the suspense beat.
  useEffect(() => {
    if (!suspense) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.35, duration: 480, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); pulse.setValue(1); };
  }, [suspense]);

  // Keep the current rung in view as the player climbs. The scroll list holds every rung
  // except the pinned top prize, ordered highest -> lowest; the current rung's index in it
  // is (total-2 - idx). We center it in the visible viewport, clamping the scroll offset to
  // the content's real bounds — near either end of the ladder that clamp is what stops us
  // scrolling past the edge, so the highlight naturally drifts off-center there instead of
  // (as before) the current rung ending up entirely outside the unbounded ScrollView.
  // Not animated: the ladder only exists while the question screen is mounted (it unmounts
  // during the trailer, where `idx` actually advances), so this only ever runs right as the
  // screen appears — an animated scroll there just reads as an unwanted jump, never a climb.
  useEffect(() => {
    const total = questions.length;
    if (!ladderViewportH || !ladderContentH || total < 2) return;
    const rowH = ladderContentH / (total - 1);
    const listPos = (total - 2) - idx;
    const itemTop = listPos * rowH;
    const maxOffset = Math.max(0, ladderContentH - ladderViewportH);
    const centered = itemTop - (ladderViewportH - rowH) / 2;
    const offset = Math.min(Math.max(centered, 0), maxOffset);
    ladderRef.current?.scrollTo({ y: offset, animated: false });
  }, [idx, questions.length, ladderViewportH, ladderContentH]);

  // Audio silence is handled by UNMOUNTING the trailer during open answering (see
  // `renderTrailer` below) rather than pausing it — an unmounted WebView can't play sound,
  // so Skip / answering can never leave a trailer audible behind the question UI.

  const total = questions.length;
  const q = questions[idx];
  const banked = idx > 0 ? PRIZES[idx - 1] : 0;

  function onFinalAnswer() {
    if (selected === null || revealed || suspense) return;
    // Suspense beat: ticking-clock tension before the reveal (like the show).
    setSuspense(true);
    // Warm the NEXT question's trailer in the background (muted) during suspense+reveal,
    // so its YouTube title has burned off before we show it. We commit before knowing
    // correctness (we need the full ~5s for the burn); a wrong answer just discards it.
    if (idx + 1 < total) { setTrailerIdx(idx + 1); setTrailerRevealed(false); }
    try { tickSound.seekTo(0); tickSound.play(); } catch {}
    tickInterval.current = setInterval(() => { try { tickSound.seekTo(0); tickSound.play(); } catch {} }, 480);
    suspenseTimer.current = setTimeout(() => {
      if (tickInterval.current) { clearInterval(tickInterval.current); tickInterval.current = null; }
      setSuspense(false);
      setRevealed(true);
      const correct = selected === q.correct_index;
      if (correct) { haptics.success(); try { successSound.seekTo(0); successSound.play(); } catch {} }
      else { haptics.warning(); try { failSound.seekTo(0); failSound.play(); } catch {} }
      advanceTimer.current = setTimeout(() => {
      if (correct) {
        if (idx + 1 >= total) {
          setEnded({ won: true, amount: PRIZES[Math.min(idx, PRIZES.length - 1)] });
          return;
        }
        setIdx(idx + 1);
        setSelected(null); setRevealed(false);
        setHidden([]); setSecondArmed(false);   // reset per-question lifeline state
        setPhase('trailer');                     // trailerIdx already points here, pre-warmed
      } else if (secondArmed) {
        // 2nd Chance: forgive the wrong pick — eliminate it and let them answer again.
        setSecondArmed(false);
        setHidden(h => [...h, selected!]);
        setSelected(null); setRevealed(false);
        // We're staying on this question — discard the pre-warmed next trailer so it
        // doesn't unmute behind the retry; it'll re-warm on the next Final Answer.
        setTrailerIdx(idx); setTrailerRevealed(false);
      } else {
        setEnded({ won: false, amount: safeFloorBelow(idx, total) });
      }
      }, REVEAL_MS);
    }, SUSPENSE_MS);
  }

  function onWalkAway() {
    if (revealed) return;
    setEnded({ won: false, amount: banked });
  }

  // ── Lifelines ──────────────────────────────────────────────
  function useFifty() {
    if (used.fifty || revealed) return;
    const wrongs = q.options.map((_, i) => i).filter(i => i !== q.correct_index && !hidden.includes(i));
    const toHide = [...wrongs].sort(() => Math.random() - 0.5).slice(0, 2);
    setHidden(h => [...h, ...toHide]);
    setUsed(u => ({ ...u, fifty: true }));
    if (selected !== null && toHide.includes(selected)) setSelected(null);
  }

  function armSecond() {
    // Pre-commitment: arming consumes it (once per game); a wrong first pick is then forgiven.
    if (used.second || revealed) return;
    setSecondArmed(true);
    setUsed(u => ({ ...u, second: true }));
  }

  async function useSwap() {
    if (used.swap || revealed || swapping) return;
    setSwapping(true);
    const usedIds = new Set(questions.map(x => x.id));
    // Exclude every movie already in the run, so a swap can't bring in a second question
    // about a film that's already appeared this game.
    const usedMovies = new Set(questions.map(x => x.movie?.id).filter(Boolean) as string[]);
    const { data } = await db.from('trivia_questions').select(SELECT_COLS)
      .eq('difficulty_band', q.difficulty_band).limit(30);
    const pool = ((data ?? []) as any[]).map(mapRow)
      .filter((x: Q) => !usedIds.has(x.id) && !usedMovies.has(x.movie?.id ?? ''));
    setSwapping(false);
    if (pool.length === 0) return; // no same-tier spare available — don't consume the lifeline
    const nq = withShuffledOptions(pool[Math.floor(Math.random() * pool.length)]);
    setQuestions(qs => qs.map((x, i) => (i === idx ? nq : x)));
    setSelected(null); setHidden([]); setSecondArmed(false); setPhase('trailer');
    setTrailerIdx(idx); setTrailerRevealed(false); // remount bg onto the swapped-in trailer
    setUsed(u => ({ ...u, swap: true }));
  }

  // ── States ──────────────────────────────────────────────
  if (loading) {
    return <View style={[st.screen, st.center]}><ActivityIndicator size="large" color={D.ochre} /></View>;
  }
  if (error || total === 0) {
    return (
      <View style={[st.screen, st.center]}>
        <Text style={st.msg}>{error ? `Error: ${error}` : 'No questions available yet.'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}><Text style={st.backTxt}>Back</Text></TouchableOpacity>
      </View>
    );
  }
  if (ended) {
    return (
      <View style={[st.screen, st.center]}>
        <Text style={st.endOver}>{ended.won ? 'YOU WON!' : 'GAME OVER'}</Text>
        <Text style={st.endAmount}>{money(ended.amount)}</Text>
        <Text style={st.endSub}>{ended.won ? 'Top of the ladder' : 'banked'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}><Text style={st.backTxt}>Done</Text></TouchableOpacity>
      </View>
    );
  }

  const answeredCorrect = revealed && selected === q.correct_index;
  // Reveal the film when the round concludes (correct, or a final wrong) — but NOT
  // when 2nd Chance is forgiving a wrong pick (the round continues).
  const showMovieReveal = revealed && (answeredCorrect || !secondArmed);
  const revealSub = q.movie
    ? `${q.movie.year ?? ''}${q.movie.director ? ` - ${q.movie.director}` : ''}`
    : '';

  // Background trailer: the one currently warming/showing (leads `idx` during suspense).
  const trailerMovie = questions[trailerIdx]?.movie ?? null;
  const hasTrailer = !!(trailerMovie as any)?.youtube_id;
  // Time from mount until this trailer is shown — the audio-unmute floor. Q1 warms during
  // the ~3.6s countdown; later trailers warm across the suspense+reveal window (~5s).
  const warmMs = countdown ? 3600 : SUSPENSE_MS + REVEAL_MS;
  // Trailer phase renders only when there's a trailer to watch; otherwise jump to the question.
  const showTrailer = !countdown && phase === 'trailer' && hasTrailer;
  const showQuestion = !countdown && !showTrailer;
  // Mount the trailer ONLY while it's warming (suspense/reveal of the previous question, or
  // the opening countdown) or actually on-screen (trailer phase). During open answering we
  // unmount it entirely — that's what guarantees Skip/answering leaves no audio playing.
  const renderTrailer = hasTrailer && (phase === 'trailer' || suspense || revealed);

  // One prize-ladder rung. `pinned` marks the always-visible top prize (fixed header) —
  // it gets its own stacked layout (tag above amount) rather than the num/amount/tag
  // row every other rung uses, since "$1,000,000" alongside a rung number AND a
  // "JACKPOT" tag doesn't fit this sidebar's width in one line without clipping.
  const renderRung = (i: number, pinned = false) => {
    const current = i === idx;
    if (pinned) {
      return (
        <View key={i} style={[st.rung, st.jackpotFrame, current && st.rungCurrent]}>
          <Text style={[st.jackpotTag, current && st.rungAmtCur]}>★ JACKPOT ★</Text>
          <Text style={[st.jackpotAmt, current && st.rungAmtCur]}>{money(PRIZES[i])}</Text>
        </View>
      );
    }
    const safe = isSafe(i, total);
    return (
      <View key={i} style={[st.rung, current && st.rungCurrent, safe && !current && st.rungSafe]}>
        <Text style={[st.rungNum, current && st.rungNumCur]}>{i + 1}</Text>
        <Text style={[st.rungAmt, current && st.rungAmtCur, safe && !current && st.rungAmtSafe]}>{money(PRIZES[i])}</Text>
        {safe && <Text style={[st.safeTag, current && st.safeTagCur]}>SAFE</Text>}
      </View>
    );
  };

  return (
    <View style={st.screen}>
      {/* Trailer — plays MUTED while warming (behind the countdown or the suspense/reveal)
          so its YouTube title burns off before it's visible; unmounted during answering. */}
      {renderTrailer && (
        <View style={StyleSheet.absoluteFill}>
          <View style={st.trailerVideoWrap}>
            <TrailerPlayer
              key={(trailerMovie as Movie).id}
              ref={trailerRef}
              movie={trailerMovie as Movie}
              unmuteAfterMs={warmMs}
              warmLeadMs={warmMs}
              onRevealed={() => setTrailerRevealed(true)}
              onEnded={() => { if (!countdown && phase === 'trailer') setPhase('question'); }}
            />
          </View>
          {/* Swallow taps so YouTube never surfaces its title/chrome on touch. */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {}} />
        </View>
      )}

      {/* 3-2-1 film-reel countdown (Q1's trailer warms muted behind it). */}
      {countdown && (
        <View style={StyleSheet.absoluteFill}>
          <FilmCountdown from={3} onComplete={() => setCountdown(false)} />
        </View>
      )}

      {/* Trailer phase: burn cover until the title has cleared, plus Skip. */}
      {showTrailer && (
        <>
          {!trailerRevealed && (
            <View style={[st.trailerScreen, StyleSheet.absoluteFill]} pointerEvents="none">
              <Image source={lcClapperboard} style={st.coverImg} />
              <Text style={st.coverTxt}>Roll the trailer…</Text>
            </View>
          )}
          <TouchableOpacity style={st.skipBtn} activeOpacity={0.85} onPress={() => setPhase('question')}>
            <Text style={st.skipTxt}>Skip to question →</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Question phase — opaque, so it fully hides the trailer warming the NEXT question. */}
      {showQuestion && (
      <SafeAreaView style={[st.screen, StyleSheet.absoluteFill]} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.wordmark}>WHO WANTS TO BE A CINEPHILE</Text>
        <View style={st.headerRight}>
          <Text style={st.bankedLabel}>BANKED </Text>
          <Text style={st.bankedVal}>{money(banked)}</Text>
          <TouchableOpacity onPress={onWalkAway} style={st.walkBtn} disabled={revealed || suspense}>
            <Text style={st.walkTxt}>WALK AWAY</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.body}>
        {/* Main column — onLayout measures the UNSCALED available height (this View's
            own size comes from flex:1 in the parent row, independent of `scale`, so
            measuring it can't feed back into itself / thrash). */}
        <View style={st.main} onLayout={(e) => setMainH(e.nativeEvent.layout.height)}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, gap: sc(SP.sm) }} showsVerticalScrollIndicator={false}>
          <View style={[st.qCard, { minHeight: sc(88), paddingVertical: sc(SP.sm), paddingHorizontal: sc(SP.lg), gap: sc(6) }]}>
            <Text style={[st.qText, { fontSize: sc(FS.xl) }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{q.question}</Text>
          </View>

          <View style={[st.optionsGrid, { rowGap: sc(SP.sm) }]}>
            {q.options.map((opt, i) => {
              if (hidden.includes(i)) return <View key={i} style={[st.option, st.optionHidden, { minHeight: sc(44) }]} />;
              const isSel = selected === i;
              // Only reveal the correct option when the round concludes — never during a
              // 2nd-Chance forgiven wrong (that would show the answer before the retry).
              const showCorrect = showMovieReveal && i === q.correct_index;
              const showWrong = revealed && isSel && i !== q.correct_index;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    st.option,
                    { minHeight: sc(44), gap: sc(SP.sm), paddingVertical: sc(8), paddingHorizontal: sc(SP.md) },
                    isSel && !revealed && st.optionSel,
                    showCorrect && st.optionCorrect,
                    showWrong && st.optionWrong,
                  ]}
                  activeOpacity={0.85}
                  disabled={revealed || suspense}
                  onPress={() => setSelected(i)}
                >
                  <View style={[st.badge, { width: sc(26), height: sc(26), backgroundColor: BADGE_COLORS[i] }]}>
                    <Text style={[st.badgeTxt, { fontSize: sc(FS.sm), color: BADGE_COLORS[i] === C.ochre ? C.ink : '#FFF' }]}>{LETTERS[i]}</Text>
                  </View>
                  <Text style={[st.optionTxt, { fontSize: sc(FS.md) }]} numberOfLines={2}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[st.actionRow, { minHeight: sc(80) }]}>
            {suspense ? (
              <Animated.Text style={[st.revealing, { fontSize: sc(FS.lg), opacity: pulse }]}>REVEALING…</Animated.Text>
            ) : revealed ? (
              showMovieReveal ? (
                <View style={st.revealBox}>
                  <Image source={lcClapperboard} style={[st.revealIcon, { width: sc(26), height: sc(26) }]} />
                  <Text style={[st.revealTitle, { fontSize: sc(FS.md) }]} numberOfLines={2}>THE FILM WAS {(q.movie?.title ?? '').toUpperCase()}</Text>
                  {!!revealSub && <Text style={[st.revealSub, { fontSize: sc(FS.sm) }]}>{revealSub}</Text>}
                </View>
              ) : (
                <Text style={[st.retryHint, { fontSize: sc(FS.md) }]}>SECOND CHANCE — PICK AGAIN</Text>
              )
            ) : (
              <>
                <TouchableOpacity
                  style={[st.finalBtn, { paddingHorizontal: sc(SP.lg), paddingVertical: sc(8) }, (selected === null || revealed) && st.finalBtnOff]}
                  disabled={selected === null || revealed}
                  onPress={onFinalAnswer}
                >
                  <Text style={[st.finalTxt, { fontSize: sc(FS.md) }]}>FINAL ANSWER</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Lifelines */}
          <View style={[st.lifelines, { gap: sc(SP.sm) }]}>
            <Text style={[st.lifeLabel, { fontSize: sc(FS.xs) }]}>LIFELINES</Text>
            <TouchableOpacity
              style={[st.lifeBtn, { paddingHorizontal: sc(SP.md), paddingVertical: sc(8) }, used.fifty && st.lifeBtnUsed]}
              disabled={used.fifty || revealed || suspense}
              onPress={useFifty}
            >
              <Text style={[st.lifeTxt, { fontSize: sc(FS.base) }, used.fifty && st.lifeTxtUsed]}>50:50</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.lifeBtn, { paddingHorizontal: sc(SP.md), paddingVertical: sc(8) }, used.swap && st.lifeBtnUsed]}
              disabled={used.swap || revealed || suspense || swapping}
              onPress={useSwap}
            >
              <Text style={[st.lifeTxt, { fontSize: sc(FS.base) }, used.swap && st.lifeTxtUsed]}>{swapping ? '…' : 'SWAP'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.lifeBtn, { paddingHorizontal: sc(SP.md), paddingVertical: sc(8) }, used.second && st.lifeBtnUsed, secondArmed && st.lifeBtnArmed]}
              disabled={used.second || revealed || suspense}
              onPress={armSecond}
            >
              <Text style={[st.lifeTxt, { fontSize: sc(FS.base) }, used.second && st.lifeTxtUsed]}>2ND CHANCE</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>

        {/* Prize ladder — top prize pinned as a fixed header; the rest scrolls and
            follows the current rung as the player climbs. */}
        <View style={[st.ladder, { marginBottom: -insets.bottom }]}>
          <View style={[st.sprocketRail, { left: 0 }]} pointerEvents="none">
            {SPROCKET_DOTS.map((_, i) => <View key={i} style={st.sprocketDot} />)}
          </View>
          <View style={[st.sprocketRail, { right: 0 }]} pointerEvents="none">
            {SPROCKET_DOTS.map((_, i) => <View key={i} style={st.sprocketDot} />)}
          </View>
          <View style={st.ladderContent}>
            <Text style={st.ladderTitle}>PRIZE LADDER</Text>
            {renderRung(total - 1, true)}
            <ScrollView
              ref={ladderRef}
              style={st.ladderScroll}
              // When the 14 rungs' combined height is shorter than the viewport (a
              // taller/roomier screen), a ScrollView's content sits at the top by
              // default — leaving dead space below rung 1 instead of it landing at
              // the screen's true bottom edge. flex-end anchors it to the bottom
              // instead, so any leftover room collects up near the jackpot/title
              // instead. Has no effect once content is actually taller than the
              // viewport (the normal, scrollable case).
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setLadderViewportH(e.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => setLadderContentH(h)}
            >
              {Array.from({ length: total - 1 }, (_, i) => total - 2 - i).map((i) => renderRung(i))}
            </ScrollView>
          </View>
        </View>
      </View>

      <ConfettiBurst trigger={revealed && selected === q.correct_index} />
      </SafeAreaView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: D.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: SP.md },
  msg: { fontFamily: Fonts.body, color: D.text, fontSize: FS.md },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SP.md,
    paddingHorizontal: SP.md, paddingVertical: SP.sm,
    backgroundColor: C.ink,                         // dark title banner — gold reads on it
    borderBottomWidth: 2, borderBottomColor: 'rgba(245,197,24,0.35)',
  },
  wordmark: { fontFamily: Fonts.display, fontSize: FS.xl, color: D.ochre, letterSpacing: 1 },
  headerMeta: { fontFamily: Fonts.label, fontSize: FS.sm, color: C.textSubDark, letterSpacing: 1.5 },
  headerRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  bankedLabel: { fontFamily: Fonts.label, fontSize: FS.sm, color: C.textSubDark, letterSpacing: 1.5 },
  bankedVal: { fontFamily: Fonts.numeric, fontSize: FS.md, color: D.ochre },
  walkBtn: {
    borderWidth: 2, borderColor: D.wrong, borderRadius: R.md, paddingHorizontal: SP.md,
    paddingVertical: 6, marginLeft: SP.sm, backgroundColor: C.surface,
  },
  walkTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.wrong, letterSpacing: 1 },

  body: { flex: 1, flexDirection: 'row' },
  // `gap` lives on the ScrollView's contentContainerStyle now (scaled) — `main` itself
  // wraps a single child (that ScrollView), so a gap here would be a no-op anyway.
  main: { flex: 1, paddingHorizontal: SP.md, paddingVertical: SP.sm },

  // Trailer phase (full screen)
  trailerScreen: { flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  // TrailerPlayer paints its own pillarbox bars in true black and needs to STRETCH to
  // fill the screen width to do it seamlessly (default alignItems: 'stretch', matching
  // game.tsx's wrapper) — `trailerScreen`'s centered/ink-colored layout is for the
  // "Roll the trailer…" cover only; reusing it here shrink-wrapped the video's own
  // black box to its pillarboxed width, leaving a visible #1A1A1A seam around it.
  trailerVideoWrap: { flex: 1, backgroundColor: '#000' },
  coverImg: { width: 104, height: 104, resizeMode: 'contain', marginBottom: SP.md },
  coverTxt: { fontFamily: Fonts.display, fontSize: FS.lg, color: C.ochre, letterSpacing: 1 },
  skipBtn: {
    position: 'absolute', bottom: SP.md, right: SP.md,
    borderWidth: 2, borderColor: C.ochre, borderRadius: R.btn,
    backgroundColor: 'rgba(26,26,26,0.65)', paddingHorizontal: SP.lg, paddingVertical: 10,
  },
  skipTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: C.ochre, letterSpacing: 1 },

  // Question
  qCard: {
    backgroundColor: D.panelHi, borderWidth: 2, borderColor: D.line, borderRadius: R.card,
    paddingVertical: SP.sm, paddingHorizontal: SP.lg, alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 88,   // keep the card its full size after dropping the "FOR $X" label
    flexShrink: 1,   // yield height on tall questions so the column never overflows/clips
  },
  qContext: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, textTransform: 'uppercase' },
  qText: { fontFamily: Fonts.display, fontSize: FS.xl, color: D.text, letterSpacing: 0.5, textAlign: 'center' },

  // Options
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SP.sm },
  option: {
    width: '48.5%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SP.sm,
    backgroundColor: D.panel, borderWidth: 2, borderColor: D.line, borderRadius: R.card,
    paddingVertical: 8, paddingHorizontal: SP.md,
  },
  optionSel: { borderColor: D.ochre, backgroundColor: 'rgba(245,197,24,0.22)' },
  optionCorrect: { borderColor: D.correct, backgroundColor: 'rgba(61,170,92,0.22)' },
  optionWrong: { borderColor: D.wrong, backgroundColor: 'rgba(232,55,42,0.18)' },
  optionHidden: { opacity: 0.12 },
  badge: {
    width: 26, height: 26, borderRadius: R.full, borderWidth: 2, borderColor: D.line,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontFamily: Fonts.numeric, fontSize: FS.sm },
  optionTxt: { flex: 1, fontFamily: Fonts.bodyBold, fontSize: FS.md, color: D.text },

  // Action row
  // Stable height (~ the movie-reveal box) so the lifelines don't jump between the
  // answering state (MISS NOW / FINAL ANSWER) and the reveal state. Natural top-down flow
  // then keeps the lifelines in a consistent upper position with free space beneath them.
  // Reserve the movie-reveal box's height (icon + "THE FILM WAS…" + year/director) up front,
  // so the row is already this tall while answering — the lifelines below never shift when
  // the reveal appears. qCard's flexShrink absorbs the reserved space on tall questions.
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, minHeight: 80 },
  missNow: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1 },
  revealing: { flex: 1, textAlign: 'center', fontFamily: Fonts.display, fontSize: FS.lg, color: D.ochre, letterSpacing: 2 },
  revealBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: SP.sm },
  revealIcon: { width: 26, height: 26, resizeMode: 'contain', marginBottom: 2 },
  revealTitle: { fontFamily: Fonts.display, fontSize: FS.md, color: D.text, letterSpacing: 0.5, textAlign: 'center' },
  revealSub: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1, textAlign: 'center' },
  retryHint: { flex: 1, textAlign: 'center', fontFamily: Fonts.display, fontSize: FS.md, color: D.wrong, letterSpacing: 1 },
  finalBtn: {
    marginLeft: 'auto', borderWidth: 2, borderColor: D.line, borderRadius: R.btn,
    paddingHorizontal: SP.lg, paddingVertical: 8, backgroundColor: D.ochre,
  },
  finalBtnOff: { backgroundColor: C.inkFaint, borderColor: D.lineSoft },
  finalTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: C.textOnOchre, letterSpacing: 1 },

  // Lifelines
  lifelines: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  lifeLabel: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, marginRight: SP.xs },
  lifeBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: 8, backgroundColor: C.surface },
  lifeBtnOff: { opacity: 0.4 },
  lifeBtnUsed: { opacity: 0.4 },
  lifeBtnArmed: { borderColor: D.correct, backgroundColor: 'rgba(61,170,92,0.22)' },
  lifeTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.text, letterSpacing: 1 },
  lifeTxtUsed: { textDecorationLine: 'line-through' },

  // Prize ladder — "Reel Track": a dark filmstrip running down the sidebar, sprocket
  // holes down both edges, each prize its own frame. The current rung reads as lit
  // from within (colored border + shadow glow) rather than a solid fill, since we
  // don't have a gradient library in this build (would need a new native build to
  // add one) — the glow gets the same "lit up" feeling with plain View/shadow styles.
  ladder: { width: 168, borderLeftWidth: 2, borderLeftColor: D.line, backgroundColor: '#0F0D0A', overflow: 'hidden', position: 'relative' },
  ladderContent: { flex: 1, paddingHorizontal: 14, paddingTop: SP.sm },
  sprocketRail: { position: 'absolute', top: 0, bottom: 0, width: 10, alignItems: 'center', paddingTop: 6, gap: 6 },
  sprocketDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2A251D' },
  ladderScroll: { flex: 1 },
  ladderTitle: { fontFamily: Fonts.label, fontSize: FS.xs, color: '#B8AC96', letterSpacing: 2, marginBottom: SP.sm, textAlign: 'center' },
  rung: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: SP.sm, gap: SP.sm,
    borderRadius: 4, borderWidth: 1.5, borderColor: '#3A3327', backgroundColor: '#1A1712',
  },
  rungCurrent: {
    borderColor: D.ochre, shadowColor: D.ochre, shadowOpacity: 0.55, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  rungSafe: { borderColor: 'rgba(61,170,92,0.55)' },
  rungNum: { fontFamily: Fonts.numeric, fontSize: FS.xs, color: '#6E6553', width: 18, textAlign: 'right' },
  rungNumCur: { color: D.ochre },
  rungAmt: { fontFamily: Fonts.numeric, fontSize: FS.base, color: '#E9E2D2' },
  rungAmtCur: { color: D.ochre },
  rungAmtSafe: { color: '#8FE0AC' },
  safeTag: { marginLeft: 'auto', fontFamily: Fonts.label, fontSize: FS.micro, color: '#8FE0AC', letterSpacing: 1 },
  safeTagCur: { color: D.ochre },
  // Jackpot gets its own stacked (not row) layout — tag above amount — so
  // "$1,000,000" never has to share a line with a tag and clip.
  jackpotFrame: {
    flexDirection: 'column', alignItems: 'center', gap: 3, paddingVertical: 10, marginBottom: 10,
    borderColor: 'rgba(245,197,24,0.6)', backgroundColor: '#241F10',
    shadowColor: D.ochre, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  jackpotTag: { fontFamily: Fonts.label, fontSize: FS.xs, letterSpacing: 2, color: D.ochre },
  jackpotAmt: { fontFamily: Fonts.numeric, fontSize: FS.lg, color: D.ochre },

  // End / misc
  endOver: { fontFamily: Fonts.display, fontSize: FS['2xl'], color: D.ochre, letterSpacing: 1 },
  endAmount: { fontFamily: Fonts.display, fontSize: FS.hero, color: D.text },
  endSub: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  backBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.btn, paddingHorizontal: SP.lg, paddingVertical: 8, marginTop: SP.sm, backgroundColor: C.surface },
  backTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: D.text, letterSpacing: 1 },
});
