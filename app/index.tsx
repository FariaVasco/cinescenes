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

const DECORATIONS = [
  { emoji: '🎬', top: '6%',  left: '4%',   rotate: '-15deg', opacity: 0.1  },
  { emoji: '🍿', top: '12%', right: '6%',  rotate: '10deg',  opacity: 0.09 },
  { emoji: '⭐', top: '4%',  left: '45%',  rotate: '5deg',   opacity: 0.07 },
  { emoji: '🎭', top: '68%', left: '2%',   rotate: '20deg',  opacity: 0.1  },
  { emoji: '🎥', top: '72%', right: '4%',  rotate: '-12deg', opacity: 0.11 },
  { emoji: '🌟', top: '40%', left: '48%',  rotate: '15deg',  opacity: 0.07 },
  { emoji: '🎬', top: '82%', left: '28%',  rotate: '-8deg',  opacity: 0.08 },
  { emoji: '🍿', top: '28%', left: '10%',  rotate: '22deg',  opacity: 0.07 },
  { emoji: '⭐', top: '55%', right: '12%', rotate: '-5deg',  opacity: 0.08 },
  { emoji: '🎭', top: '20%', left: '60%',  rotate: '30deg',  opacity: 0.07 },
];

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
      {DECORATIONS.map((d, i) => (
        <Text
          key={i}
          style={{
            position: 'absolute',
            fontSize: 36,
            opacity: d.opacity,
            top: d.top as any,
            left: d.left as any,
            right: d.right as any,
            transform: [{ rotate: d.rotate }],
          }}
          pointerEvents="none"
        >
          {d.emoji}
        </Text>
      ))}

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
    backgroundColor: '#100a20',
    paddingHorizontal: 24,
  },
  // Portrait
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 42,
    fontWeight: '900',
    color: '#f5c518',
    letterSpacing: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(245,197,24,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  tagline: {
    fontSize: 13,
    color: '#9a9aaa',
    marginTop: 10,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontWeight: '500',
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
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  buttonPrimary: {
    backgroundColor: '#f5c518',
  },
  buttonSecondary: {
    backgroundColor: '#1e1630',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonIconText: {
    fontSize: 24,
    marginBottom: 2,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0a0a0a',
    letterSpacing: 0.6,
  },
  buttonTextSecondary: {
    color: '#f5c518',
  },
  buttonSub: {
    fontSize: 12,
    color: '#888',
    letterSpacing: 0.3,
  },
});
