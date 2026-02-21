import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  useWindowDimensions,
} from 'react-native';
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
  const isLandscape = width > height;

  const { currentMovie, setCurrentMovie, activeMovies, setActiveMovies } = useAppStore();
  const trailerRef = useRef<TrailerPlayerHandle>(null);
  const [key, setKey] = useState(0);
  const [hasReplayed, setHasReplayed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

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
      // snapshot remaining time via the ref the player updated internally
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
    trailerRef.current?.replay();
  }

  async function handleNext() {
    let pool = activeMovies.filter((m) => m.id !== currentMovie!.id);

    if (pool.length === 0) {
      const { data } = await supabase.from('movies').select('*').eq('active', true);
      if (data) {
        setActiveMovies(data);
        pool = data.filter((m) => m.id !== currentMovie!.id);
      }
    }

    if (pool.length === 0) {
      Alert.alert('No more movies', 'No other active movies available.');
      return;
    }

    const next = pool[Math.floor(Math.random() * pool.length)];
    setCurrentMovie(next);
    setKey((k) => k + 1);
    setHasReplayed(false);
    setEnded(false);
    setUserPaused(false);
  }

  function handleReport() {
    setShowReportModal(true);
  }

  async function submitReport(reason: string) {
    setShowReportModal(false);
    await supabase.from('reports').insert({
      movie_id: currentMovie!.id,
      reason,
    });
    Alert.alert('Thanks! 🙏', 'We\'ll review this trailer soon.');
  }

  return (
    <View style={styles.container}>
      <TrailerPlayer key={key} ref={trailerRef} movie={currentMovie} onEnded={handleEnded} />

      {/* ── Playback layer (hidden once ended) ── */}
      {!ended && (
        <>
          {/*
            Touch blocker: sits above the WebView, intercepts all taps on blank areas.
            Rendered before SafeAreaView so buttons inside SafeAreaView still win.
          */}
          {!userPaused && (
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={handleTapToggle}
            />
          )}

          {/* Controls overlay — close, report, and skip buttons */}
          <SafeAreaView
            style={styles.controls}
            edges={isLandscape ? ['left', 'right'] : ['bottom']}
            pointerEvents="box-none"
          >
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.closeButton} onPress={() => router.replace('/')}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
                <Text style={styles.reportButtonText}>⚑ Report</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.bottomBar, isLandscape && styles.bottomBarLandscape]}>
              <TouchableOpacity style={[styles.actionButton, styles.skipButton]} onPress={handleSkipToGuess}>
                <Text style={styles.skipButtonText}>I know it! →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/*
            Pause overlay: rendered AFTER SafeAreaView so it covers everything.
            Tapping it resumes playback.
          */}
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
            <TouchableOpacity style={styles.closeButton} onPress={() => router.replace('/')}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

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
                  <Text style={styles.replayButtonText}>↺ Replay</Text>
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

      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.reportOverlay}>
          <View style={styles.reportSheet}>
            <Text style={styles.reportTitle}>What's wrong with this trailer?</Text>
            {REPORT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.reportOption}
                onPress={() => submitReport(opt.label)}
              >
                <Text style={styles.reportOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.reportCancel} onPress={() => setShowReportModal(false)}>
              <Text style={styles.reportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingTop: 56,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  reportButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reportButtonText: {
    color: '#aaa',
    fontSize: 13,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 20,
    justifyContent: 'center',
  },
  bottomBarLandscape: {
    justifyContent: 'center',
  },
  skipButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  endedCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  endedTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  endedSubtitle: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
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
    fontWeight: '600',
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
    fontSize: 16,
    fontWeight: '700',
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  reportSheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  reportTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  reportOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reportOptionText: {
    color: '#e0e0e0',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  reportCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reportCancelText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
});
