import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Dialog, Portal, Snackbar, Button as PaperButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
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

  const { currentMovie, setCurrentMovie, activeMovies, setActiveMovies, fromScanner, setFromScanner } = useAppStore();
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
    router.replace('/');
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
      const { data } = await supabase.from('movies').select('*').eq('active', true);
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
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowExitDialog(true)}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.cornerActions}>
              <TouchableOpacity style={styles.reportButton} onPress={() => setShowReportDialog(true)}>
                <Text style={styles.reportButtonText}>⚑ Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipButton} onPress={handleSkipToGuess}>
                <Text style={styles.skipButtonText}>I know it! →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

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
              <Text style={styles.endedTitle}>Ready to guess? 🎬</Text>
              <Text style={styles.endedSubtitle}>What year is this movie from?</Text>
            </View>

            <View style={styles.endedActions}>
              {!hasReplayed && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.replayButton]}
                  onPress={handleReplay}
                >
                  <Text style={styles.replayButtonText}>↺  Replay</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionButton, styles.nextButton]}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>Let's guess! →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* ── Paper overlays (Portal renders above everything) ── */}
      <Portal>

        {/* Exit confirmation dialog */}
        <Dialog
          visible={showExitDialog}
          onDismiss={() => setShowExitDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Leave game?</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogBody}>Your current trailer will be lost.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              textColor="#888"
              onPress={() => setShowExitDialog(false)}
            >
              Stay
            </PaperButton>
            <PaperButton
              textColor="#f5c518"
              onPress={() => { setShowExitDialog(false); setFromScanner(false); router.replace('/'); }}
            >
              Leave
            </PaperButton>
          </Dialog.Actions>
        </Dialog>

        {/* Report dialog */}
        <Dialog
          visible={showReportDialog}
          onDismiss={() => setShowReportDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>What's wrong?</Dialog.Title>
          <Dialog.ScrollArea style={[styles.reportScrollArea, { maxHeight: height * 0.45 }]}>
            <ScrollView>
              {REPORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.reportOption}
                  onPress={() => submitReport(opt.label)}
                >
                  <Text style={styles.reportOptionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <PaperButton textColor="#888" onPress={() => setShowReportDialog(false)}>
              Cancel
            </PaperButton>
          </Dialog.Actions>
        </Dialog>

      </Portal>

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
  actionButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 22,
  },
  replayButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  replayButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nextButton: {
    backgroundColor: '#f5c518',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  nextButtonText: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Paper dialog ──
  dialog: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
  },
  dialogTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  dialogBody: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  reportScrollArea: {
    paddingHorizontal: 0,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reportOption: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reportOptionText: {
    color: '#e0e0e0',
    fontSize: 14,
    letterSpacing: 0.1,
  },

  // ── Snackbar ──
  snack: {
    backgroundColor: '#1e1630',
    marginBottom: 16,
  },
});
