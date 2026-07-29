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
import { SafeAreaView } from 'react-native-safe-area-context';
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

  useFocusEffect(useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []));

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
      // Random subset each play (replay variety), ordered easy -> hard for the ladder.
      const run = uniqueByMovie.slice(0, RUN_LEN).sort((a, b) => (a.difficulty_score ?? 0.5) - (b.difficulty_score ?? 0.5));
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

  // One prize-ladder rung. `pinned` marks the always-visible top prize (fixed header).
  const renderRung = (i: number, pinned = false) => {
    const current = i === idx;
    const top = i === total - 1;
    const safe = isSafe(i, total) && !top;
    return (
      <View key={i} style={[st.rung, pinned && st.rungPinned, current && st.rungCurrent, safe && !current && st.rungSafe, top && !current && st.rungTop]}>
        <Text style={[st.rungNum, current && st.rungNumCur]}>{i + 1}</Text>
        <Text style={[st.rungAmt, current && st.rungAmtCur, safe && !current && st.rungAmtSafe, top && !current && st.rungAmtTop]}>{money(PRIZES[i])}</Text>
        {safe && <Text style={[st.safeTag, current && st.safeTagCur]}>SAFE</Text>}
        {top && <Text style={[st.safeTag, current && st.safeTagCur, top && !current && st.safeTagTop]}>JACKPOT</Text>}
      </View>
    );
  };

  return (
    <View style={st.screen}>
      {/* Trailer — plays MUTED while warming (behind the countdown or the suspense/reveal)
          so its YouTube title burns off before it's visible; unmounted during answering. */}
      {renderTrailer && (
        <View style={StyleSheet.absoluteFill}>
          <View style={st.trailerScreen}>
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
        {/* Main column */}
        <View style={st.main}>
          <View style={st.qCard}>
            <Text style={st.qText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{q.question}</Text>
          </View>

          <View style={st.optionsGrid}>
            {q.options.map((opt, i) => {
              if (hidden.includes(i)) return <View key={i} style={[st.option, st.optionHidden]} />;
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
                    isSel && !revealed && st.optionSel,
                    showCorrect && st.optionCorrect,
                    showWrong && st.optionWrong,
                  ]}
                  activeOpacity={0.85}
                  disabled={revealed || suspense}
                  onPress={() => setSelected(i)}
                >
                  <View style={[st.badge, { backgroundColor: BADGE_COLORS[i] }]}>
                    <Text style={[st.badgeTxt, { color: BADGE_COLORS[i] === C.ochre ? C.ink : '#FFF' }]}>{LETTERS[i]}</Text>
                  </View>
                  <Text style={st.optionTxt} numberOfLines={2}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={st.actionRow}>
            {suspense ? (
              <Animated.Text style={[st.revealing, { opacity: pulse }]}>REVEALING…</Animated.Text>
            ) : revealed ? (
              showMovieReveal ? (
                <View style={st.revealBox}>
                  <Image source={lcClapperboard} style={st.revealIcon} />
                  <Text style={st.revealTitle} numberOfLines={2}>THE FILM WAS {(q.movie?.title ?? '').toUpperCase()}</Text>
                  {!!revealSub && <Text style={st.revealSub}>{revealSub}</Text>}
                </View>
              ) : (
                <Text style={st.retryHint}>SECOND CHANCE — PICK AGAIN</Text>
              )
            ) : (
              <>
                <TouchableOpacity
                  style={[st.finalBtn, (selected === null || revealed) && st.finalBtnOff]}
                  disabled={selected === null || revealed}
                  onPress={onFinalAnswer}
                >
                  <Text style={st.finalTxt}>FINAL ANSWER</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Lifelines */}
          <View style={st.lifelines}>
            <Text style={st.lifeLabel}>LIFELINES</Text>
            <TouchableOpacity
              style={[st.lifeBtn, used.fifty && st.lifeBtnUsed]}
              disabled={used.fifty || revealed || suspense}
              onPress={useFifty}
            >
              <Text style={[st.lifeTxt, used.fifty && st.lifeTxtUsed]}>50:50</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.lifeBtn, used.swap && st.lifeBtnUsed]}
              disabled={used.swap || revealed || suspense || swapping}
              onPress={useSwap}
            >
              <Text style={[st.lifeTxt, used.swap && st.lifeTxtUsed]}>{swapping ? '…' : 'SWAP'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.lifeBtn, used.second && st.lifeBtnUsed, secondArmed && st.lifeBtnArmed]}
              disabled={used.second || revealed || suspense}
              onPress={armSecond}
            >
              <Text style={[st.lifeTxt, used.second && st.lifeTxtUsed]}>2ND CHANCE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Prize ladder — top prize pinned as a fixed header; the rest scrolls and
            follows the current rung as the player climbs. */}
        <View style={st.ladder}>
          <Text style={st.ladderTitle}>PRIZE LADDER</Text>
          {renderRung(total - 1, true)}
          <ScrollView
            ref={ladderRef}
            style={st.ladderScroll}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => setLadderViewportH(e.nativeEvent.layout.height)}
            onContentSizeChange={(_, h) => setLadderContentH(h)}
          >
            {Array.from({ length: total - 1 }, (_, i) => total - 2 - i).map((i) => renderRung(i))}
          </ScrollView>
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
  bankedVal: { fontFamily: Fonts.bodyBold, fontSize: FS.md, color: D.ochre },
  walkBtn: {
    borderWidth: 2, borderColor: D.wrong, borderRadius: R.md, paddingHorizontal: SP.md,
    paddingVertical: 6, marginLeft: SP.sm, backgroundColor: C.surface,
  },
  walkTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.wrong, letterSpacing: 1 },

  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, paddingHorizontal: SP.md, paddingVertical: SP.sm, gap: SP.sm },

  // Trailer phase (full screen)
  trailerScreen: { flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
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
  badgeTxt: { fontFamily: Fonts.display, fontSize: FS.sm },
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

  // Prize ladder
  ladder: { width: 168, borderLeftWidth: 2, borderLeftColor: D.line, paddingHorizontal: SP.sm, paddingTop: SP.sm, backgroundColor: C.surfaceHigh },
  ladderScroll: { flex: 1 },
  ladderTitle: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, marginBottom: SP.sm, textAlign: 'center' },
  rung: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: SP.sm, borderRadius: R.sm, gap: SP.sm },
  rungPinned: { borderBottomWidth: 2, borderBottomColor: D.lineSoft, borderRadius: 0, marginBottom: 4, paddingBottom: 8 },
  rungCurrent: { backgroundColor: D.ochre },
  rungSafe: { backgroundColor: 'rgba(61,170,92,0.16)' },
  rungTop: { backgroundColor: 'rgba(245,197,24,0.32)' },
  rungNum: { fontFamily: Fonts.bodyBold, fontSize: FS.sm, color: D.sub, width: 22, textAlign: 'right' },
  rungNumCur: { color: C.ink },
  rungAmt: { fontFamily: Fonts.bodyBold, fontSize: FS.base, color: D.text },
  rungAmtCur: { color: C.ink },
  rungAmtSafe: { color: D.correct },
  rungAmtTop: { color: C.textOnOchre },
  safeTag: { marginLeft: 'auto', fontFamily: Fonts.label, fontSize: FS.micro, color: D.correct, letterSpacing: 1 },
  safeTagCur: { color: C.ink },
  safeTagTop: { color: C.textOnOchre },

  // End / misc
  endOver: { fontFamily: Fonts.display, fontSize: FS['2xl'], color: D.ochre, letterSpacing: 1 },
  endAmount: { fontFamily: Fonts.display, fontSize: FS.hero, color: D.text },
  endSub: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  backBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.btn, paddingHorizontal: SP.lg, paddingVertical: 8, marginTop: SP.sm, backgroundColor: C.surface },
  backTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: D.text, letterSpacing: 1 },
});
