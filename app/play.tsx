import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { CastModal } from '@/components/CastModal';

export default function PlayScreen() {
  const router = useRouter();
  const { setActiveMovies, setCurrentMovie, setFromScanner, setTvMode, activeMovies } = useAppStore();
  const [showModeModal, setShowModeModal] = useState(false);
  const [castModalVisible, setCastModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

  useEffect(() => {
    fetchActiveMovies();
  }, []);

  async function fetchActiveMovies() {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .eq('active', true);
    if (data && !error) setActiveMovies(data);
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
      {/* Top bar: back ← on left, cast icon on right */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.castBtn} onPress={() => setCastModalVisible(true)}>
          <MaterialCommunityIcons name="cast" size={20} color="rgba(255,255,255,0.4)" />
          <Text style={styles.castBtnLabel}>Cast</Text>
        </TouchableOpacity>
      </View>

      {/* Two main action cards — centred in remaining space */}
      <View style={styles.cardArea}>
      <View style={styles.cards}>
        <TouchableOpacity
          style={[styles.card, styles.cardPrimary]}
          onPress={() => router.push('/scanner')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="qrcode-scan" size={36} color="#0a0a0a" />
          <Text style={styles.cardTitle}>Scan Card</Text>
          <Text style={styles.cardSub}>QR code on your physical card</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardSecondary]}
          onPress={handlePickMovie}
          activeOpacity={0.8}
        >
          <Text style={styles.cardIcon}>🎲</Text>
          <Text style={[styles.cardTitle, styles.cardTitleSecondary]}>Pick Movie</Text>
          <Text style={styles.cardSub}>Random from the deck</Text>
        </TouchableOpacity>
      </View>
      </View>

      {/* ── Cast to TV modal ── */}
      <CastModal
        visible={castModalVisible}
        onDismiss={() => setCastModalVisible(false)}
        onConfirm={() => {
          setTvMode(true);
          setCastModalVisible(false);
        }}
      />

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
              {/* Curated */}
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
                  ⚠️ AI processing is experimental. We cannot guarantee complete accuracy — the model may miss details.
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
    flexDirection: 'column',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 24,
  },
  castBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  castBtnLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Action cards ──
  cards: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 32,
  },
  card: {
    flex: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  cardPrimary: {
    backgroundColor: '#f5c518',
  },
  cardSecondary: {
    backgroundColor: '#1e1630',
    borderWidth: 1,
    borderColor: '#333',
  },
  cardIcon: {
    fontSize: 32,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0a0a0a',
    letterSpacing: 0.4,
  },
  cardTitleSecondary: {
    color: '#f5c518',
  },
  cardSub: {
    fontSize: 12,
    color: '#666',
    letterSpacing: 0.3,
    textAlign: 'center',
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
  modeCloseBtn: { padding: 4 },
  modeCloseText: { color: '#666', fontSize: 16 },
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
  modeCardDimmed: { opacity: 0.65 },
  modeCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeCardIcon: { fontSize: 26 },
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
