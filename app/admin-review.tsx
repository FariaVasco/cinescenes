import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import YoutubePlayer from 'react-native-youtube-iframe';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { C, R, FS, Fonts, SP } from '@/constants/theme';

// ── types ─────────────────────────────────────────────────────────────────────

interface Movie {
  id: string;
  title: string;
  year: number;
  director: string | null;
  youtube_id: string;
}

interface Review {
  status: 'ok' | 'ad_issue' | 'unavailable';
  reviewedAt: string;
  youtubeId: string;  // stored to detect when the trailer URL is replaced
  title: string;
  year: number;
}

type ReviewStore = Record<string, Review>;

const REVIEWS_KEY = '@cinescenes/admin_reviews';
const SIDEBAR_W   = 220;

// ── screen ────────────────────────────────────────────────────────────────────

export default function AdminReviewScreen() {
  const router  = useRouter();
  const [phase, setPhase]       = useState<'loading' | 'review' | 'done'>('loading');
  const [queue, setQueue]       = useState<Movie[]>([]);
  const [idx,   setIdx]         = useState(0);
  const [store, setStore]       = useState<ReviewStore>({});
  const [playerDims, setPlayerDims] = useState({ width: 0, height: 0 });

  // Stay in landscape — landing already locked it, but be explicit
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  // ── load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setPhase('loading');

    const raw     = await AsyncStorage.getItem(REVIEWS_KEY);
    const reviews: ReviewStore = raw ? JSON.parse(raw) : {};

    const { data } = await supabase
      .from('movies')
      .select('id, title, year, director, youtube_id')
      .eq('scan_status', 'flagged')
      .eq('available_ios', false)
      .not('youtube_id', 'is', null)
      .order('year', { ascending: true });

    const all = (data ?? []) as Movie[];

    // Show a movie if it was never reviewed, or if its youtube_id was replaced
    // since the last review. This powers the "only new since last check" feature
    // automatically — once a trailer is swapped, it re-enters the queue.
    const toReview = all.filter(m => {
      const prev = reviews[m.id];
      return !prev || prev.youtubeId !== m.youtube_id;
    });

    setStore(reviews);
    setQueue(toReview);
    setIdx(0);
    setPhase(toReview.length === 0 ? 'done' : 'review');
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── actions ───────────────────────────────────────────────────────────────

  async function saveAndAdvance(movie: Movie, status: 'ok' | 'ad_issue' | 'unavailable') {
    // Write platform availability to DB immediately
    if (status === 'ad_issue') {
      await supabase
        .from('movies')
        .update({ available_android: false, available_ios: true })
        .eq('id', movie.id);
    } else if (status === 'unavailable') {
      await supabase
        .from('movies')
        .update({ available_android: false, available_ios: false })
        .eq('id', movie.id);
    }

    const updated: ReviewStore = {
      ...store,
      [movie.id]: {
        status,
        reviewedAt: new Date().toISOString(),
        youtubeId:  movie.youtube_id,
        title:      movie.title,
        year:       movie.year,
      },
    };
    setStore(updated);
    await AsyncStorage.setItem(REVIEWS_KEY, JSON.stringify(updated));
    advance();
  }

  function advance() {
    const next = idx + 1;
    if (next >= queue.length) setPhase('done');
    else setIdx(next);
  }

  async function handleReset() {
    await AsyncStorage.removeItem(REVIEWS_KEY);
    load();
  }

  // ── loading ───────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={styles.loadText}>Loading trailers…</Text>
      </View>
    );
  }

  // ── done / summary ────────────────────────────────────────────────────────

  if (phase === 'done') {
    const totalReviewed = Object.keys(store).length;
    const adIssues    = Object.entries(store).filter(([, v]) => v.status === 'ad_issue');
    const unavailable = Object.entries(store).filter(([, v]) => v.status === 'unavailable');

    async function handleExport() {
      const lines: string[] = [];
      if (adIssues.length > 0) {
        lines.push(`AD ISSUE (${adIssues.length}) — Android only, iOS fine:`);
        adIssues.forEach(([, r]) => lines.push(`  ${r.title} (${r.year}) — youtu.be/${r.youtubeId}`));
        lines.push('');
      }
      if (unavailable.length > 0) {
        lines.push(`UNAVAILABLE (${unavailable.length}) — needs replacement:`);
        unavailable.forEach(([, r]) => lines.push(`  ${r.title} (${r.year}) — youtu.be/${r.youtubeId}`));
      }
      const message = [
        `Cinescenes trailer review (${totalReviewed} reviewed)`,
        '',
        ...lines,
      ].join('\n');
      await Share.share({ message, title: 'Trailer review results' });
    }

    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.doneContent}>
          <Text style={styles.doneEmoji}>🎬</Text>
          <Text style={styles.doneTitle}>All caught up!</Text>
          <Text style={styles.doneSub}>
            {totalReviewed} trailer{totalReviewed !== 1 ? 's' : ''} reviewed
            {adIssues.length > 0 ? ` · ${adIssues.length} ad issue${adIssues.length !== 1 ? 's' : ''}` : ''}
            {unavailable.length > 0 ? ` · ${unavailable.length} unavailable` : ''}
            {adIssues.length === 0 && unavailable.length === 0 ? ' · all clear' : ''}
          </Text>

          {adIssues.length > 0 && (
            <View style={styles.flaggedBox}>
              <Text style={styles.flaggedBoxLabel}>AD ISSUE — ANDROID ONLY</Text>
              {adIssues.map(([id, r]) => (
                <View key={id} style={styles.flaggedRow}>
                  <Text style={styles.flaggedTitle}>{r.title} ({r.year})</Text>
                  <Text style={styles.flaggedYt}>youtu.be/{r.youtubeId}</Text>
                </View>
              ))}
            </View>
          )}

          {unavailable.length > 0 && (
            <View style={[styles.flaggedBox, styles.unavailableBox]}>
              <Text style={[styles.flaggedBoxLabel, styles.unavailableBoxLabel]}>UNAVAILABLE — NEEDS REPLACEMENT</Text>
              {unavailable.map(([id, r]) => (
                <View key={id} style={styles.flaggedRow}>
                  <Text style={styles.flaggedTitle}>{r.title} ({r.year})</Text>
                  <Text style={styles.flaggedYt}>youtu.be/{r.youtubeId}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.doneActions}>
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.8}>
              <Text style={styles.resetBtnText}>Review All Again</Text>
            </TouchableOpacity>
            {(adIssues.length > 0 || unavailable.length > 0) && (
              <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.8}>
                <Text style={styles.exportBtnText}>Export Results</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.exitBtn} onPress={() => router.back()} activeOpacity={0.85}>
              <Text style={styles.exitBtnText}>← Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── review ────────────────────────────────────────────────────────────────

  const movie = queue[idx];
  if (!movie) return null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.layout}>

        {/* YouTube player — fills the left side */}
        <View
          style={styles.playerWrap}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setPlayerDims({ width, height });
          }}
        >
          {playerDims.width > 0 && (
            <YoutubePlayer
              key={movie.id}            // remount on each new movie for a clean state
              width={playerDims.width}
              height={playerDims.height}
              videoId={movie.youtube_id}
              play={true}
              initialPlayerParams={{
                controls: true,
                rel: false,
                modestbranding: true,
              }}
            />
          )}
        </View>

        {/* Sidebar — right side */}
        <View style={styles.sidebar}>

          {/* Counter */}
          <Text style={styles.counter}>
            <Text style={styles.counterCurrent}>{idx + 1}</Text>
            <Text style={styles.counterTotal}> / {queue.length}</Text>
          </Text>

          {/* Movie info */}
          <View style={styles.movieInfo}>
            <Text style={styles.movieTitle}>{movie.title}</Text>
            <Text style={styles.movieYear}>{movie.year}</Text>
            {movie.director
              ? <Text style={styles.movieDir}>{movie.director}</Text>
              : null}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOk]}
              onPress={() => saveAndAdvance(movie, 'ok')}
              activeOpacity={0.8}
            >
              <Text style={styles.btnOkText}>✓  All Good</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnFlag]}
              onPress={() => saveAndAdvance(movie, 'ad_issue')}
              activeOpacity={0.8}
            >
              <Text style={styles.btnFlagText}>⚑  Ad Issue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnUnavailable]}
              onPress={() => saveAndAdvance(movie, 'unavailable')}
              activeOpacity={0.8}
            >
              <Text style={styles.btnUnavailableText}>✕  Unavailable</Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity onPress={advance} activeOpacity={0.7} style={styles.secondaryBtn}>
                <Text style={styles.skipText}>Skip →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.secondaryBtn}>
                <Text style={styles.exitLinkText}>← Exit</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  loadText: { color: '#888', fontFamily: Fonts.body, fontSize: FS.base },

  // Review layout
  layout:     { flex: 1, flexDirection: 'row' },
  playerWrap: { flex: 1, backgroundColor: '#000' },

  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: C.inkSurface,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    justifyContent: 'space-between',
  },

  counter: { marginBottom: 8 },
  counterCurrent: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.ochre,
  },
  counterTotal: {
    fontFamily: Fonts.body,
    fontSize: FS.base,
    color: '#555',
  },

  movieInfo: { gap: 2, marginBottom: 0 },
  movieTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
    color: C.textPrimaryDark,
    lineHeight: 18,
  },
  movieYear: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.ochre,
  },
  movieDir: {
    fontFamily: Fonts.body,
    fontSize: FS.xs,
    color: C.textMutedDark,
  },

  actions: { gap: 7 },

  btn: {
    borderRadius: R.btn,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOk: {
    backgroundColor: '#1e3a1e',
    borderWidth: 2,
    borderColor: '#2a5c2a',
  },
  btnOkText: {
    color: '#5acc5a',
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
  },
  btnFlag: {
    backgroundColor: '#3a2a1e',
    borderWidth: 2,
    borderColor: '#5c3a1e',
  },
  btnFlagText: {
    color: '#cc8c3a',
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
  },
  btnUnavailable: {
    backgroundColor: '#3a1e1e',
    borderWidth: 2,
    borderColor: '#5c2a2a',
  },
  btnUnavailableText: {
    color: '#cc5a5a',
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  secondaryBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  skipText: {
    color: '#555',
    fontFamily: Fonts.label,
    fontSize: FS.xs,
  },
  exitLinkText: {
    color: '#3a3a3a',
    fontFamily: Fonts.label,
    fontSize: FS.xs,
  },

  // Done / summary
  doneContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 0,
  },
  doneEmoji: { fontSize: 40, marginBottom: 12 },
  doneTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.textPrimaryDark,
    marginBottom: 6,
  },
  doneSub: {
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    color: '#777',
    marginBottom: 24,
    textAlign: 'center',
  },

  flaggedBox: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#111',
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: '#2a1e1e',
    padding: 14,
    gap: 8,
    marginBottom: 24,
  },
  flaggedBoxLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: '#cc5a5a',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  unavailableBox: {
    borderColor: '#2a1a3a',
  },
  unavailableBoxLabel: {
    color: '#a05acc',
  },
  flaggedRow: { gap: 2 },
  flaggedTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: FS.sm,
    color: C.textPrimaryDark,
  },
  flaggedYt: {
    fontFamily: Fonts.body,
    fontSize: FS.xs,
    color: '#666',
  },

  doneActions: {
    flexDirection: 'row',
    gap: 12,
  },
  resetBtn: {
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: '#555',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  resetBtnText: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: '#888',
  },
  exportBtn: {
    borderRadius: R.btn,
    backgroundColor: '#1e2e3a',
    borderWidth: 2,
    borderColor: '#2a4a5c',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  exportBtnText: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: '#5aacc8',
  },
  exitBtn: {
    borderRadius: R.btn,
    backgroundColor: C.ochre,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  exitBtnText: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ink,
  },
});
