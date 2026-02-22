import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Modal,
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

  const { setActiveMovies, setCurrentMovie, setFromScanner, activeMovies } = useAppStore();
  const [showModeModal, setShowModeModal] = useState(false);

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

  const yearSpan = activeMovies.length > 0
    ? new Date().getFullYear() - Math.min(...activeMovies.map((m) => m.year))
    : 50;

  function handlePickMovie() {
    setShowModeModal(true);
  }

  async function handlePlayCurated() {
    setShowModeModal(false);
    let pool = activeMovies;
    if (pool.length === 0) {
      await fetchActiveMovies();
      return;
    }
    const movie = pool[Math.floor(Math.random() * pool.length)];
    setFromScanner(false);
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
      {/* ── Mode picker modal ── */}
      <Modal
        visible={showModeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowModeModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modeSheet}>
            <View style={styles.modeHeader}>
              <Text style={styles.modeHeaderTitle}>How do you want to play?</Text>
              <TouchableOpacity onPress={() => setShowModeModal(false)} style={styles.modeCloseBtn}>
                <Text style={styles.modeCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modeCards}>
              {/* Curated mode */}
              <View style={styles.modeCard}>
                <Text style={styles.modeCardIcon}>🎬</Text>
                <Text style={styles.modeCardTitle}>Curated</Text>
                <Text style={styles.modeCardDesc}>
                  {activeMovies.length} hand-picked movies spanning the last {yearSpan} years of cinema.
                </Text>
                <TouchableOpacity style={styles.modePlayBtn} onPress={handlePlayCurated}>
                  <Text style={styles.modePlayBtnText}>Play →</Text>
                </TouchableOpacity>
              </View>

              {/* Insane mode */}
              <View style={[styles.modeCard, styles.modeCardDimmed]}>
                <View style={styles.modeCardTopRow}>
                  <Text style={styles.modeCardIcon}>⚡</Text>
                  <View style={styles.modeBadge}>
                    <Text style={styles.modeBadgeText}>UNDER CONSTRUCTION</Text>
                  </View>
                </View>
                <Text style={styles.modeCardTitle}>Insane Mode</Text>
                <Text style={styles.modeCardDesc}>
                  Any movie, any era — no curated list. Our AI removes names, faces and other
                  spoilers from the audio and video in real time.
                </Text>
                <Text style={styles.modeCardDisclaimer}>
                  ⚠️ AI processing is experimental. We cannot guarantee complete accuracy — the model may miss some details.
                </Text>
                <View style={styles.modeDisabledBtn}>
                  <Text style={styles.modeDisabledBtnText}>Stay tuned</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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

  // ── Mode picker modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  modeSheet: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 680,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modeHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modeCloseBtn: {
    padding: 4,
  },
  modeCloseText: {
    color: '#666',
    fontSize: 16,
  },
  modeCards: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#252040',
    borderRadius: 14,
    padding: 18,
    gap: 8,
  },
  modeCardDimmed: {
    opacity: 0.65,
  },
  modeCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeCardIcon: {
    fontSize: 26,
  },
  modeBadge: {
    backgroundColor: 'rgba(245,197,24,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeBadgeText: {
    color: '#f5c518',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  modeCardTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  modeCardDesc: {
    color: '#999',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  modeCardDisclaimer: {
    color: '#666',
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
  },
  modePlayBtn: {
    backgroundColor: '#f5c518',
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modePlayBtnText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '800',
  },
  modeDisabledBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modeDisabledBtnText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
});
