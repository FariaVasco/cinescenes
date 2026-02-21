import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { setActiveMovies, setCurrentMovie, activeMovies } = useAppStore();

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
              <MaterialCommunityIcons name="qrcode-scan" size={28} color="#0a0a0a" />
              <Text style={styles.buttonText}>Scan Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handlePickMovie}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIconText}>🎲</Text>
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Pick Movie</Text>
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
              <MaterialCommunityIcons name="qrcode-scan" size={28} color="#0a0a0a" />
              <Text style={styles.buttonText}>Scan Card</Text>
              <Text style={styles.buttonSub}>QR code on your physical card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handlePickMovie}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIconText}>🎲</Text>
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Pick Movie</Text>
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
  buttonTextSecondary: {
    color: '#f5c518',
  },
  buttonSub: {
    fontSize: 12,
    color: '#555',
  },
});
