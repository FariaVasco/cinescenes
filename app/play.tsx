import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { CastToTVIcon } from '@/components/CinemaIcons';

const lcFilmStrip   = require('@/assets/lc-film-strip.png');
const lcCard        = require('@/assets/lc-card.png');
import { CastModal } from '@/components/CastModal';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

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
      .eq('scan_status', 'validated');
    if (data && !error) setActiveMovies(data);
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* Geometric accent */}
      <View style={styles.accentTopLeft} pointerEvents="none" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <BackButton onPress={() => router.back()} label="" style={{ marginHorizontal: 0, marginTop: 0 }} />
        <TouchableOpacity style={styles.castBtn} onPress={() => setCastModalVisible(true)}>
          <CastToTVIcon size={18} color={C.textMuted} />
          <Text style={styles.castBtnLabel}>Cast</Text>
        </TouchableOpacity>
      </View>

      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>How will you play?</Text>
        <Text style={styles.title}>Choose your mode</Text>
        <View style={styles.titleUnderline} />
      </View>

      {/* Mode cards */}
      <View style={styles.cardArea}>

        {/* Primary — Go Digital */}
        <TouchableOpacity
          style={[styles.card, styles.cardPrimary]}
          onPress={() => router.push('/local-lobby')}
          activeOpacity={0.85}
        >
          <View style={styles.cardIconWrap}>
            <Image source={lcFilmStrip} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
          </View>
          <Text style={[styles.cardTitle, styles.cardTitlePrimary]}>Go Digital</Text>
          <Text style={[styles.cardSub, styles.cardSubPrimary]}>
            Up to 8 players · no physical cards needed
          </Text>
        </TouchableOpacity>

        {/* Secondary — Use Your Deck */}
        <TouchableOpacity
          style={[styles.card, styles.cardSecondary]}
          onPress={() => router.push('/scanner')}
          activeOpacity={0.85}
        >
          <View style={styles.cardIconWrap}>
            <Image source={lcCard} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
          </View>
          <Text style={[styles.cardTitle, styles.cardTitleSecondary]}>Use Your Deck</Text>
          <Text style={styles.cardSub}>
            Scan the QR code on your physical cards · rotates to landscape
          </Text>
        </TouchableOpacity>

      </View>

      <CastModal
        visible={castModalVisible}
        onDismiss={() => setCastModalVisible(false)}
        onConfirm={() => { setTvMode(true); setCastModalVisible(false); }}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Geometric accent
  accentTopLeft: {
    position: 'absolute',
    top: -70,
    left: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(245,197,24,0.08)',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
  },
  castBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.full,
    borderWidth: 2,
    borderColor: C.inkFaint,
  },
  castBtnLabel: {
    fontFamily: Fonts.label,
    color: C.textMuted,
    fontSize: FS.sm,
  },

  // Header
  header: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.lg,
    gap: 4,
  },
  sectionLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: C.textMuted,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    color: C.ink,
    letterSpacing: 0.5,
  },
  titleUnderline: {
    width: 40,
    height: 2,
    backgroundColor: C.ochre,
    marginTop: 6,
  },

  // Cards
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SP.lg,
    gap: SP.md,
  },
  card: {
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  cardPrimary: {
    backgroundColor: C.ochre,
  },
  cardSecondary: {
    backgroundColor: C.surface,
  },
  cardIconWrap: {
    marginBottom: 4,
  },
  cardTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl + 2,
    letterSpacing: 0.5,
  },
  cardTitlePrimary: {
    color: C.ink,
  },
  cardTitleSecondary: {
    color: C.ink,
  },
  cardSub: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: C.textSub,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardSubPrimary: {
    color: 'rgba(26,26,26,0.6)',
  },
});
