import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrailerPlayer, TrailerPlayerHandle } from '@/components/TrailerPlayer';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

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
    Alert.alert(
      'Report trailer',
      'Does this trailer reveal the movie title, year, or director during the safe window?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('reports').insert({
              movie_id: currentMovie!.id,
              reason: 'Trailer reveals identifying information in safe window',
            });
            Alert.alert('Thanks', 'We will review this trailer.');
          },
        },
      ]
    );
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
  },
  endedSubtitle: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
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
    borderRadius: 12,
  },
  replayButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  replayButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#f5c518',
  },
  nextButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '700',
  },
});
