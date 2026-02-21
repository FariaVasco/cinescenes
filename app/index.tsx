import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    hasSeenLandscapeModal,
    setHasSeenLandscapeModal,
    setActiveMovies,
    setCurrentMovie,
    activeMovies,
  } = useAppStore();

  useEffect(() => {
    fetchActiveMovies();
  }, []);

  async function fetchActiveMovies() {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .eq('active', true);

    if (data && !error) {
      setActiveMovies(data);
    }
  }

  async function handlePickMovie() {
    if (activeMovies.length === 0) {
      await fetchActiveMovies();
      return;
    }
    const randomIndex = Math.floor(Math.random() * activeMovies.length);
    const movie = activeMovies[randomIndex];
    setCurrentMovie(movie);
    router.push('/trailer');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Modal
        visible={!hasSeenLandscapeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setHasSeenLandscapeModal(true)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>📱</Text>
            <Text style={styles.modalTitle}>Landscape recommended</Text>
            <Text style={styles.modalBody}>
              For the best experience, rotate your device to landscape when viewing trailers.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setHasSeenLandscapeModal(true)}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* In landscape: title on the left, buttons on the right */}
      {isLandscape ? (
        <View style={styles.landscapeLayout}>
          <View style={styles.landscapeHeader}>
            <Text style={styles.logo}>CINESCENES</Text>
            <Text style={styles.tagline}>Guess the movie.{'\n'}Build your timeline.</Text>
          </View>
          <View style={styles.landscapeActions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => router.push('/scanner')}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIconText}>⬛</Text>
              <Text style={styles.buttonText}>Scan Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handlePickMovie}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIconText}>🎲</Text>
              <Text style={styles.buttonText}>Pick Movie</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.logo}>CINESCENES</Text>
            <Text style={styles.tagline}>Guess the movie. Build your timeline.</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => router.push('/scanner')}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIconText}>⬛</Text>
              <Text style={styles.buttonText}>Scan Card</Text>
              <Text style={styles.buttonSub}>QR code on your physical card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handlePickMovie}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIconText}>🎲</Text>
              <Text style={styles.buttonText}>Pick Movie</Text>
              <Text style={styles.buttonSub}>Random from the deck</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {activeMovies.length > 0 ? `${activeMovies.length} movies in play` : 'Loading movies…'}
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
  },
  // Portrait
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 38,
    fontWeight: '900',
    color: '#f5c518',
    letterSpacing: 6,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  actions: {
    flex: 1.2,
    justifyContent: 'center',
    gap: 16,
  },
  footer: {
    paddingBottom: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#444',
  },
  // Landscape
  landscapeLayout: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  landscapeHeader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  landscapeActions: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  // Shared button styles
  button: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  buttonPrimary: {
    backgroundColor: '#f5c518',
  },
  buttonSecondary: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonIconText: {
    fontSize: 24,
    marginBottom: 2,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0a0a0a',
  },
  buttonSub: {
    fontSize: 12,
    color: '#555',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    maxWidth: 340,
    width: '100%',
  },
  modalEmoji: {
    fontSize: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 15,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButton: {
    marginTop: 8,
    backgroundColor: '#f5c518',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a0a0a',
  },
});
