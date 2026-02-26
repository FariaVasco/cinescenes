import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { C, R, FS } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { CastModal } from '@/components/CastModal';

export default function PlayScreen() {
  const router = useRouter();
  const { setActiveMovies, setTvMode } = useAppStore();
  const [castModalVisible, setCastModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
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

      {/* Two main action cards — stacked vertically */}
      <View style={styles.cardArea}>
        <View style={styles.cards}>
          <TouchableOpacity
            style={[styles.card, styles.cardPrimary]}
            onPress={() => router.push('/scanner')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="cards-playing-outline" size={36} color="#0a0a0a" />
            <Text style={styles.cardTitle}>Use Your Deck</Text>
            <Text style={styles.cardSub}>Scan the QR code on your physical cards</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardSecondary]}
            onPress={() => router.push('/local-lobby')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="account-group" size={36} color="#f5c518" />
            <Text style={[styles.cardTitle, styles.cardTitleSecondary]}>Go Digital</Text>
            <Text style={styles.cardSub}>Up to 8 players, no physical cards needed</Text>
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
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
    borderRadius: R.btn,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  castBtnLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FS.sm,
    fontWeight: '600',
  },

  // ── Action cards ──
  cards: {
    flexDirection: 'column',
    gap: 16,
    paddingHorizontal: 32,
    width: '100%',
  },
  card: {
    borderRadius: R.card,
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
    backgroundColor: C.gold,
  },
  cardSecondary: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTitle: {
    fontSize: FS.lg + 1,
    fontWeight: '900',
    color: C.textOnGold,
    letterSpacing: 0.4,
  },
  cardTitleSecondary: {
    color: C.gold,
  },
  cardSub: {
    fontSize: FS.sm,
    color: C.textMuted,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
