/**
 * Movie Millionaire — single-player trivia (Phase B, core loop).
 * Landscape. Reads pre-generated questions from `trivia_questions`.
 * Core loop only: question -> select -> final answer -> reveal -> advance / lose /
 * walk away. Lifelines are rendered but wired in a later step; trailer intro later.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import FilmCountdown from '@/components/FilmCountdown';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import * as haptics from '@/lib/haptics';

const db = supabase as unknown as { from: (t: string) => any };

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
const REVEAL_MS = 1600;

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
  category: string;
  movie: { title: string; year: number } | null;
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

const SELECT_COLS = 'id,question,options,correct_index,difficulty_band,category,movies(title,year)';
function mapRow(r: any): Q {
  return {
    id: r.id, question: r.question, options: r.options, correct_index: r.correct_index,
    difficulty_band: r.difficulty_band, category: r.category, movie: r.movies ?? null,
  };
}

export default function TriviaScreen() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(true);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ended, setEnded] = useState<{ won: boolean; amount: number } | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lifelines (each once per game)
  const [used, setUsed] = useState({ fifty: false, swap: false, second: false });
  const [hidden, setHidden] = useState<number[]>([]);   // option indices removed (50/50 or 2nd-chance elimination)
  const [secondArmed, setSecondArmed] = useState(false); // extra life active for the current question
  const [swapping, setSwapping] = useState(false);

  useFocusEffect(useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []));

  useEffect(() => {
    (async () => {
      const { data, error } = await db
        .from('trivia_questions')
        .select(SELECT_COLS)
        .order('difficulty_score', { ascending: true })
        .limit(11);
      if (error) { setError(error.message); setLoading(false); return; }
      const qs: Q[] = (data ?? []).map((r: any) => withShuffledOptions(mapRow(r)));
      setQuestions(qs);
      setLoading(false);
    })();
    return () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); };
  }, []);

  const total = questions.length;
  const q = questions[idx];
  const banked = idx > 0 ? PRIZES[idx - 1] : 0;

  function onFinalAnswer() {
    if (selected === null || revealed) return;
    setRevealed(true);
    const correct = selected === q.correct_index;
    if (correct) haptics.success(); else haptics.warning();
    advanceTimer.current = setTimeout(() => {
      if (correct) {
        if (idx + 1 >= total) {
          setEnded({ won: true, amount: PRIZES[Math.min(idx, PRIZES.length - 1)] });
          return;
        }
        setIdx(idx + 1);
        setSelected(null); setRevealed(false);
        setHidden([]); setSecondArmed(false);   // reset per-question lifeline state
      } else if (secondArmed) {
        // 2nd Chance: forgive the wrong pick — eliminate it and let them answer again.
        setSecondArmed(false);
        setHidden(h => [...h, selected!]);
        setSelected(null); setRevealed(false);
      } else {
        setEnded({ won: false, amount: safeFloorBelow(idx, total) });
      }
    }, REVEAL_MS);
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
    const { data } = await db.from('trivia_questions').select(SELECT_COLS)
      .eq('difficulty_band', q.difficulty_band).limit(30);
    const pool = ((data ?? []) as any[]).map(mapRow).filter((x: Q) => !usedIds.has(x.id));
    setSwapping(false);
    if (pool.length === 0) return; // no same-tier spare available — don't consume the lifeline
    const nq = withShuffledOptions(pool[Math.floor(Math.random() * pool.length)]);
    setQuestions(qs => qs.map((x, i) => (i === idx ? nq : x)));
    setSelected(null); setHidden([]); setSecondArmed(false);
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
  // 3-2-1 film-reel countdown before the round starts (same as the multiplayer mode),
  // shown once questions are loaded so the first question is ready when it finishes.
  if (countdown) {
    return (
      <View style={st.screen}>
        <FilmCountdown from={3} onComplete={() => setCountdown(false)} />
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

  const tier = Math.floor(idx / 5) + 1;
  const missNow = safeFloorBelow(idx, total);

  return (
    <SafeAreaView style={st.screen} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.wordmark}>MOVIE MILLIONAIRE</Text>
        <Text style={st.headerMeta}>Q {idx + 1}/{total} · TIER {tier}</Text>
        <View style={st.headerRight}>
          <Text style={st.bankedLabel}>BANKED </Text>
          <Text style={st.bankedVal}>{money(banked)}</Text>
          <TouchableOpacity onPress={onWalkAway} style={st.walkBtn} disabled={revealed}>
            <Text style={st.walkTxt}>WALK AWAY</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.body}>
        {/* Main column */}
        <View style={st.main}>
          <View style={st.qCard}>
            <Text style={st.qContext}>
              {(q.movie?.title ?? '').toUpperCase()} · FOR {money(PRIZES[idx])}
            </Text>
            <Text style={st.qText}>{q.question}</Text>
          </View>

          <View style={st.optionsGrid}>
            {q.options.map((opt, i) => {
              if (hidden.includes(i)) return <View key={i} style={[st.option, st.optionHidden]} />;
              const isSel = selected === i;
              const showCorrect = revealed && i === q.correct_index;
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
                  disabled={revealed}
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
            <Text style={st.missNow}>MISS NOW → {money(missNow)}</Text>
            <TouchableOpacity
              style={[st.finalBtn, (selected === null || revealed) && st.finalBtnOff]}
              disabled={selected === null || revealed}
              onPress={onFinalAnswer}
            >
              <Text style={st.finalTxt}>FINAL ANSWER</Text>
            </TouchableOpacity>
          </View>

          {/* Lifelines */}
          <View style={st.lifelines}>
            <Text style={st.lifeLabel}>LIFELINES</Text>
            <TouchableOpacity
              style={[st.lifeBtn, used.fifty && st.lifeBtnUsed]}
              disabled={used.fifty || revealed}
              onPress={useFifty}
            >
              <Text style={[st.lifeTxt, used.fifty && st.lifeTxtUsed]}>50:50</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.lifeBtn, used.swap && st.lifeBtnUsed]}
              disabled={used.swap || revealed || swapping}
              onPress={useSwap}
            >
              <Text style={[st.lifeTxt, used.swap && st.lifeTxtUsed]}>{swapping ? '…' : 'SWAP'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.lifeBtn, used.second && st.lifeBtnUsed, secondArmed && st.lifeBtnArmed]}
              disabled={used.second || revealed}
              onPress={armSecond}
            >
              <Text style={[st.lifeTxt, used.second && st.lifeTxtUsed]}>2ND CHANCE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Prize ladder */}
        <View style={st.ladder}>
          <Text style={st.ladderTitle}>PRIZE LADDER</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {Array.from({ length: total }, (_, i) => total - 1 - i).map((i) => {
              const current = i === idx;
              const safe = isSafe(i, total);
              return (
                <View key={i} style={[st.rung, current && st.rungCurrent, safe && !current && st.rungSafe]}>
                  <Text style={[st.rungNum, current && st.rungNumCur]}>{i + 1}</Text>
                  <Text style={[st.rungAmt, current && st.rungAmtCur, safe && !current && st.rungAmtSafe]}>{money(PRIZES[i])}</Text>
                  {safe && <Text style={[st.safeTag, current && st.safeTagCur]}>SAFE</Text>}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <ConfettiBurst trigger={revealed && selected === q.correct_index} />
    </SafeAreaView>
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
    backgroundColor: C.surfaceHigh,
    borderBottomWidth: 2, borderBottomColor: D.line,
  },
  wordmark: { fontFamily: Fonts.display, fontSize: FS.xl, color: D.ochre, letterSpacing: 1 },
  headerMeta: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  headerRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  bankedLabel: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  bankedVal: { fontFamily: Fonts.bodyBold, fontSize: FS.md, color: D.text },
  walkBtn: {
    borderWidth: 2, borderColor: D.wrong, borderRadius: R.md, paddingHorizontal: SP.md,
    paddingVertical: 6, marginLeft: SP.sm, backgroundColor: C.surface,
  },
  walkTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.wrong, letterSpacing: 1 },

  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, padding: SP.md, gap: SP.sm },

  // Question
  qCard: {
    backgroundColor: D.panelHi, borderWidth: 2, borderColor: D.line, borderRadius: R.card,
    paddingVertical: SP.md, paddingHorizontal: SP.lg, alignItems: 'center', gap: 6,
  },
  qContext: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, textTransform: 'uppercase' },
  qText: { fontFamily: Fonts.display, fontSize: FS.xl, color: D.text, letterSpacing: 0.5, textAlign: 'center' },

  // Options
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  option: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: SP.sm,
    backgroundColor: D.panel, borderWidth: 2, borderColor: D.line, borderRadius: R.card,
    paddingVertical: 10, paddingHorizontal: SP.md,
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
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  missNow: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1 },
  finalBtn: {
    marginLeft: 'auto', borderWidth: 2, borderColor: D.line, borderRadius: R.btn,
    paddingHorizontal: SP.lg, paddingVertical: 8, backgroundColor: D.ochre,
  },
  finalBtnOff: { backgroundColor: C.inkFaint, borderColor: D.lineSoft },
  finalTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: C.textOnOchre, letterSpacing: 1 },

  // Lifelines
  lifelines: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: 'auto' },
  lifeLabel: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, marginRight: SP.xs },
  lifeBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: 8, backgroundColor: C.surface },
  lifeBtnOff: { opacity: 0.4 },
  lifeBtnUsed: { opacity: 0.4 },
  lifeBtnArmed: { borderColor: D.correct, backgroundColor: 'rgba(61,170,92,0.22)' },
  lifeTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.text, letterSpacing: 1 },
  lifeTxtUsed: { textDecorationLine: 'line-through' },

  // Prize ladder
  ladder: { width: 168, borderLeftWidth: 2, borderLeftColor: D.line, paddingHorizontal: SP.sm, paddingTop: SP.sm, backgroundColor: C.surfaceHigh },
  ladderTitle: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, marginBottom: SP.sm, textAlign: 'center' },
  rung: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: SP.sm, borderRadius: R.sm, gap: SP.sm },
  rungCurrent: { backgroundColor: D.ochre },
  rungSafe: { backgroundColor: 'rgba(61,170,92,0.16)' },
  rungNum: { fontFamily: Fonts.bodyBold, fontSize: FS.sm, color: D.sub, width: 22, textAlign: 'right' },
  rungNumCur: { color: C.ink },
  rungAmt: { fontFamily: Fonts.bodyBold, fontSize: FS.base, color: D.text },
  rungAmtCur: { color: C.ink },
  rungAmtSafe: { color: D.correct },
  safeTag: { marginLeft: 'auto', fontFamily: Fonts.label, fontSize: FS.micro, color: D.correct, letterSpacing: 1 },
  safeTagCur: { color: C.ink },

  // End / misc
  endOver: { fontFamily: Fonts.display, fontSize: FS['2xl'], color: D.ochre, letterSpacing: 1 },
  endAmount: { fontFamily: Fonts.display, fontSize: FS.hero, color: D.text },
  endSub: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  backBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.btn, paddingHorizontal: SP.lg, paddingVertical: 8, marginTop: SP.sm, backgroundColor: C.surface },
  backTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: D.text, letterSpacing: 1 },
});
