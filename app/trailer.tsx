import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { CinemaButton } from '@/components/CinemaButton';
import { C, R, FS } from '@/constants/theme';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrailerPlayer, TrailerPlayerHandle } from '@/components/TrailerPlayer';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

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

export default function TrailerScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

  const { currentMovie, setCurrentMovie, activeMovies, setActiveMovies, fromScanner, setFromScanner, tvMode, setTvMode } = useAppStore();

  useEffect(() => () => setTvMode(false), []);

  const trailerRef = useRef<TrailerPlayerHandle>(null);
  const [key, setKey] = useState(0);
  const [hasReplayed, setHasReplayed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  // Dialog / feedback state
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');

  if (!currentMovie) {
    router.replace('/play');
    return null;
  }

  const handleEnded = useCallback(() => {
    setEnded(true);
    setUserPaused(false);
  }, []);

  function handleTapToggle() {
    if (!userPaused) {
      trailerRef.current?.pause();
      setUserPaused(true);
    } else {
      setUserPaused(false);
      trailerRef.current?.resume();
    }
  }

  function handleSkipToGuess() {
    trailerRef.current?.stop();
    setUserPaused(false);
    setEnded(true);
  }

  function handleReplay() {
    if (hasReplayed) return;
    setHasReplayed(true);
    setEnded(false);
    setUserPaused(false);
  }

  async function handleNext() {
    if (fromScanner) {
      router.replace('/scanner');
      return;
    }

    let pool = activeMovies.filter((m) => m.id !== currentMovie!.id);

    if (pool.length === 0) {
      const { data } = await supabase.from('movies').select('*').eq('scan_status', 'validated');
      if (data) {
        setActiveMovies(data);
        pool = data.filter((m) => m.id !== currentMovie!.id);
      }
    }

    if (pool.length === 0) {
      setSnackMessage('No other active movies available right now.');
      return;
    }

    const next = pool[Math.floor(Math.random() * pool.length)];
    setCurrentMovie(next);
    setKey((k) => k + 1);
    setHasReplayed(false);
    setEnded(false);
    setUserPaused(false);
  }

  async function submitReport(reason: string) {
    setShowReportDialog(false);
    await supabase.from('reports').insert({
      movie_id: currentMovie!.id,
      reason,
    });
    setSnackMessage("Thanks! 🙏  We'll review this trailer soon.");
  }

  return (
    <View style={styles.container}>
      {/* TrailerPlayer only rendered while playing — unmounting stops audio */}
      {!ended && (
        <TrailerPlayer key={key} ref={trailerRef} movie={currentMovie} onEnded={handleEnded} />
      )}

      {/* ── Playback layer ── */}
      {!ended && (
        <>
          {/* Touch blocker — intercepts background taps */}
          {!userPaused && (
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={handleTapToggle}
            />
          )}

          {/* Controls: ✕ top-right, Report + "I know it!" bottom-right */}
          <SafeAreaView
            style={styles.controls}
            edges={['top', 'bottom', 'right']}
            pointerEvents="box-none"
          >
            {tvMode ? (
              <Pressable
                style={[styles.closeButton, styles.closeButtonTV]}
                delayLongPress={500}
                onLongPress={() => setShowExitDialog(true)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            ) : (
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowExitDialog(true)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            )}

            <View style={styles.cornerActions}>
              {!tvMode && (
                <TouchableOpacity style={styles.reportButton} onPress={() => setShowReportDialog(true)}>
                  <Text style={styles.reportButtonText}>⚑ Report</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.skipButton} onPress={handleSkipToGuess}>
                <Text style={styles.skipButtonText}>I know it! →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* TV Mode: movie title bar at the bottom */}
          {tvMode && (
            <View style={styles.tvTitleBar} pointerEvents="none">
              <Text style={styles.tvTitleText}>
                {currentMovie.title}
                {'  ·  '}
                {currentMovie.year}
              </Text>
            </View>
          )}

          {/* Pause overlay — tapping resumes */}
          {userPaused && (
            <TouchableOpacity
              style={styles.pauseOverlay}
              activeOpacity={1}
              onPress={handleTapToggle}
            >
              <Text style={styles.pauseIcon}>▶</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Ended screen ── */}
      {ended && (
        <View style={styles.endedOverlay}>
          <SafeAreaView style={styles.endedInner} edges={['top', 'bottom']}>
            <View style={styles.endedTopRow}>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowExitDialog(true)}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.endedCenter}>
              <Text style={styles.endedTitle}>Ready to guess?</Text>
              <Text style={styles.endedSubtitle}>What year is this movie from?</Text>
            </View>

            <View style={styles.endedActions}>
              {!hasReplayed && (
                <CinemaButton variant="ghost" size="md" onPress={handleReplay}>
                  ↺  Replay
                </CinemaButton>
              )}
              <CinemaButton size="lg" onPress={handleNext}>
                LET'S GUESS →
              </CinemaButton>
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* ── Exit confirmation modal ── */}
      <Modal
        visible={showExitDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExitDialog(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowExitDialog(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.exitSheet}>
            <View style={styles.exitSheetLeft}>
              <Text style={styles.exitTitle}>Leave game?</Text>
              <Text style={styles.exitBody}>Your current trailer will be lost.</Text>
            </View>
            <View style={styles.exitSheetRight}>
              <CinemaButton size="sm" onPress={() => setShowExitDialog(false)}>
                Stay
              </CinemaButton>
              <CinemaButton
                variant="ghost"
                size="sm"
                onPress={() => { setShowExitDialog(false); setFromScanner(false); router.replace('/play'); }}
              >
                Leave →
              </CinemaButton>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Report modal ── */}
      <Modal
        visible={showReportDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportDialog(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowReportDialog(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.reportSheet}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>What's wrong?</Text>
              <TouchableOpacity onPress={() => setShowReportDialog(false)} style={styles.reportCloseBtn}>
                <Text style={styles.reportCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.reportGrid}>
              {REPORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.reportOption}
                  onPress={() => submitReport(opt.label)}
                >
                  <Text style={styles.reportOptionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Success / info snackbar */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Playback controls ──
  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cornerActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  reportButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reportButtonText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#f5c518',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  skipButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIcon: {
    color: '#fff',
    fontSize: 72,
    opacity: 0.9,
  },

  // ── Ended screen ──
  endedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 20,
  },
  endedInner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
  },
  endedTopRow: {
    alignItems: 'flex-end',
  },
  endedCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  endedTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  endedSubtitle: {
    color: '#f5c518',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  endedActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingBottom: 16,
  },

  // ── Modals (landscape-optimised) ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },

  // Exit — single horizontal card
  exitSheet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    backgroundColor: C.surface,
    borderRadius: R.card,
    paddingVertical: 22,
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 560,
  },
  exitSheetLeft: {
    flex: 1,
    gap: 5,
  },
  exitTitle: {
    color: C.textPrimary,
    fontSize: FS.md,
    fontWeight: '700',
  },
  exitBody: {
    color: C.textMuted,
    fontSize: FS.sm,
  },
  exitSheetRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Report — 2-column grid panel
  reportSheet: {
    backgroundColor: C.surface,
    borderRadius: 18,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 640,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  reportTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  reportCloseBtn: {
    padding: 4,
  },
  reportCloseText: {
    color: '#666',
    fontSize: 16,
  },
  reportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  reportOption: {
    width: '50%',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  reportOptionText: {
    color: '#d0d0d0',
    fontSize: 13,
    lineHeight: 18,
  },

  // ── TV Mode ──
  closeButtonTV: {
    opacity: 0.2,
  },
  tvTitleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  tvTitleText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Snackbar ──
  snack: {
    backgroundColor: '#1e1630',
    marginBottom: 16,
  },
});
