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

const db = supabase as unknown as { from: (t: string) => any };

// Warm-dark palette for this cinematic screen (derived from the ligne-claire tokens).
const D = {
  bg: '#191510',
  panel: '#2A2620',
  panelHi: '#332E26',
  line: 'rgba(245,197,24,0.30)',
  lineSoft: 'rgba(255,255,255,0.10)',
  text: C.textOnDark,
  sub: C.textSubDark,
  ochre: C.ochre,
  correct: C.leaf,
  wrong: C.vermillion,
};

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

export default function TriviaScreen() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [ended, setEnded] = useState<{ won: boolean; amount: number } | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []));

  useEffect(() => {
    (async () => {
      const { data, error } = await db
        .from('trivia_questions')
        .select('id,question,options,correct_index,difficulty_band,category,movies(title,year)')
        .order('difficulty_score', { ascending: true })
        .limit(11);
      if (error) { setError(error.message); setLoading(false); return; }
      const qs: Q[] = (data ?? []).map((r: any) => ({
        id: r.id, question: r.question, options: r.options, correct_index: r.correct_index,
        difficulty_band: r.difficulty_band, category: r.category, movie: r.movies ?? null,
      }));
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
    advanceTimer.current = setTimeout(() => {
      if (!correct) {
        setEnded({ won: false, amount: safeFloorBelow(idx, total) });
        return;
      }
      if (idx + 1 >= total) {
        setEnded({ won: true, amount: PRIZES[Math.min(idx, PRIZES.length - 1)] });
        return;
      }
      setIdx(idx + 1);
      setSelected(null);
      setRevealed(false);
    }, REVEAL_MS);
  }

  function onWalkAway() {
    if (revealed) return;
    setEnded({ won: false, amount: banked });
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
                  <View style={[st.badge, (isSel || showCorrect) && st.badgeActive, showWrong && st.badgeWrong]}>
                    <Text style={st.badgeTxt}>{LETTERS[i]}</Text>
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

          {/* Lifelines — rendered; wired in the next step */}
          <View style={st.lifelines}>
            <Text style={st.lifeLabel}>LIFELINES</Text>
            {[['50:50'], ['SWAP'], ['2ND CHANCE']].map(([l]) => (
              <View key={l} style={[st.lifeBtn, st.lifeBtnOff]}>
                <Text style={st.lifeTxt}>{l}</Text>
              </View>
            ))}
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
    borderBottomWidth: 2, borderBottomColor: D.line,
  },
  wordmark: { fontFamily: Fonts.display, fontSize: FS.xl, color: D.ochre, letterSpacing: 1 },
  headerMeta: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  headerRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  bankedLabel: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  bankedVal: { fontFamily: Fonts.bodyBold, fontSize: FS.md, color: D.ochre },
  walkBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: 6, marginLeft: SP.sm },
  walkTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.text, letterSpacing: 1 },

  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, padding: SP.md, gap: SP.sm },

  // Question
  qCard: {
    backgroundColor: D.panel, borderWidth: 2, borderColor: D.line, borderRadius: R.card,
    paddingVertical: SP.md, paddingHorizontal: SP.lg, alignItems: 'center', gap: 6,
  },
  qContext: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, textTransform: 'uppercase' },
  qText: { fontFamily: Fonts.display, fontSize: FS.xl, color: D.text, letterSpacing: 0.5, textAlign: 'center' },

  // Options
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  option: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: SP.sm,
    backgroundColor: D.panel, borderWidth: 2, borderColor: D.lineSoft, borderRadius: R.card,
    paddingVertical: 10, paddingHorizontal: SP.md,
  },
  optionSel: { borderColor: D.ochre, backgroundColor: D.panelHi },
  optionCorrect: { borderColor: D.correct, backgroundColor: 'rgba(61,170,92,0.18)' },
  optionWrong: { borderColor: D.wrong, backgroundColor: 'rgba(232,55,42,0.18)' },
  badge: {
    width: 26, height: 26, borderRadius: R.full, borderWidth: 2, borderColor: D.ochre,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeActive: { backgroundColor: D.ochre },
  badgeWrong: { borderColor: D.wrong, backgroundColor: D.wrong },
  badgeTxt: { fontFamily: Fonts.display, fontSize: FS.sm, color: D.ochre },
  optionTxt: { flex: 1, fontFamily: Fonts.bodyBold, fontSize: FS.md, color: D.text },

  // Action row
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  missNow: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1 },
  finalBtn: {
    marginLeft: 'auto', borderWidth: 2, borderColor: D.ochre, borderRadius: R.btn,
    paddingHorizontal: SP.lg, paddingVertical: 8, backgroundColor: 'rgba(245,197,24,0.12)',
  },
  finalBtnOff: { borderColor: D.lineSoft, backgroundColor: 'transparent' },
  finalTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: D.ochre, letterSpacing: 1 },

  // Lifelines
  lifelines: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: 'auto' },
  lifeLabel: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, marginRight: SP.xs },
  lifeBtn: { borderWidth: 2, borderColor: D.lineSoft, borderRadius: R.md, paddingHorizontal: SP.md, paddingVertical: 8 },
  lifeBtnOff: { opacity: 0.5 },
  lifeTxt: { fontFamily: Fonts.display, fontSize: FS.base, color: D.text, letterSpacing: 1 },

  // Prize ladder
  ladder: { width: 168, borderLeftWidth: 2, borderLeftColor: D.line, paddingHorizontal: SP.sm, paddingTop: SP.sm },
  ladderTitle: { fontFamily: Fonts.label, fontSize: FS.xs, color: D.sub, letterSpacing: 2, marginBottom: SP.sm, textAlign: 'center' },
  rung: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: SP.sm, borderRadius: R.sm, gap: SP.sm },
  rungCurrent: { backgroundColor: D.ochre },
  rungSafe: { backgroundColor: 'rgba(245,197,24,0.10)' },
  rungNum: { fontFamily: Fonts.bodyBold, fontSize: FS.sm, color: D.sub, width: 22, textAlign: 'right' },
  rungNumCur: { color: C.ink },
  rungAmt: { fontFamily: Fonts.bodyBold, fontSize: FS.base, color: D.text },
  rungAmtCur: { color: C.ink },
  rungAmtSafe: { color: D.ochre },
  safeTag: { marginLeft: 'auto', fontFamily: Fonts.label, fontSize: FS.micro, color: D.ochre, letterSpacing: 1 },
  safeTagCur: { color: C.ink },

  // End / misc
  endOver: { fontFamily: Fonts.display, fontSize: FS['2xl'], color: D.ochre, letterSpacing: 1 },
  endAmount: { fontFamily: Fonts.display, fontSize: FS.hero, color: D.text },
  endSub: { fontFamily: Fonts.label, fontSize: FS.sm, color: D.sub, letterSpacing: 1.5 },
  backBtn: { borderWidth: 2, borderColor: D.line, borderRadius: R.btn, paddingHorizontal: SP.lg, paddingVertical: 8, marginTop: SP.sm },
  backTxt: { fontFamily: Fonts.display, fontSize: FS.md, color: D.text, letterSpacing: 1 },
});
