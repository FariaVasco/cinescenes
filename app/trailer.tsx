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

  if (!currentMovie) {
    router.replace('/');
    return null;
  }

  const handleEnded = useCallback(() => {
    setEnded(true);
  }, []);

  function handleReplay() {
    if (hasReplayed) return;
    setHasReplayed(true);
    setEnded(false);
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

      <SafeAreaView
        style={styles.controls}
        edges={isLandscape ? ['left', 'right'] : ['bottom']}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.replace('/')}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
            <Text style={styles.reportButtonText}>⚑ Report</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom actions — row in landscape, row in portrait but right-aligned */}
        <View style={[styles.bottomBar, isLandscape && styles.bottomBarLandscape]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.replayButton, hasReplayed && styles.disabled]}
            onPress={handleReplay}
            disabled={hasReplayed}
          >
            <Text style={styles.replayButtonText}>
              {hasReplayed ? 'Replayed' : '↺ Replay'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.nextButton]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
    pointerEvents: 'box-none',
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
    gap: 12,
    padding: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bottomBarLandscape: {
    justifyContent: 'center',
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
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
  disabled: {
    opacity: 0.4,
  },
});
