import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, T, SP } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { presentCustomerCenter, checkPremium } from '@/lib/revenuecat';
import { Collection } from '@/lib/database.types';
import { DecoFilmReel, DecoClapperboard, DecoStar } from '@/components/CinemaIcons';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';
import { PaywallSheet } from '@/components/PaywallSheet';

const db = supabase as unknown as { from: (t: string) => any };

const DECOS = [
  { Component: DecoFilmReel,     size: 96,  top: '3%',  right: '3%',  rotate: '12deg',  opacity: 0.05 },
  { Component: DecoClapperboard, size: 80,  top: '5%',  left: '2%',   rotate: '-8deg',  opacity: 0.05 },
  { Component: DecoStar,         size: 44,  top: '60%', left: '5%',   rotate: '20deg',  opacity: 0.06 },
  { Component: DecoFilmReel,     size: 68,  top: '72%', right: '4%',  rotate: '-14deg', opacity: 0.05 },
];

export default function ModeSelectScreen() {
  const router = useRouter();
  const {
    authUser, isPremium, setIsPremium,
    setSelectedGameMode, setSelectedCollectionId,
  } = useAppStore();

  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallPendingMode, setPaywallPendingMode] = useState<'collection' | 'insane'>('collection');
  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  useEffect(() => {
    loadCollections();
  }, []);

  async function loadCollections() {
    setLoadingCollections(true);
    const { data } = await db
      .from('collections')
      .select('*')
      .eq('is_active', true) as { data: Collection[] | null };
    if (data) setCollections(data);
    setLoadingCollections(false);
  }

  function handleStandard() {
    setSelectedGameMode('standard');
    setSelectedCollectionId(null);
    router.replace({ pathname: '/local-lobby', params: { startView: 'create' } });
  }

  async function handleCollections() {
    if (!authUser) {
      router.push('/sign-in?returnTo=mode-select');
      return;
    }
    if (!isPremium) {
      setPaywallPendingMode('collection');
      setPaywallVisible(true);
      return;
    }
    setCollectionPickerVisible(true);
  }

  async function handlePaywallPurchased() {
    setPaywallVisible(false);
    const premium = await checkPremium();
    setIsPremium(premium);
    if (premium) {
      if (paywallPendingMode === 'insane') {
        setSelectedGameMode('insane');
        setSelectedCollectionId(null);
        router.replace({ pathname: '/local-lobby', params: { startView: 'create' } });
      } else {
        setCollectionPickerVisible(true);
      }
    }
  }

  async function handleInsaneMode() {
    if (!authUser) {
      router.push('/sign-in?returnTo=mode-select');
      return;
    }
    if (!isPremium) {
      setPaywallPendingMode('insane');
      setPaywallVisible(true);
      return;
    }
    setSelectedGameMode('insane');
    setSelectedCollectionId(null);
    router.replace({ pathname: '/local-lobby', params: { startView: 'create' } });
  }

  async function handleAccount() {
    await presentCustomerCenter();
  }

  function handleSelectCollection(col: Collection) {
    setSelectedGameMode('collection');
    setSelectedCollectionId(col.id);
    setCollectionPickerVisible(false);
    router.replace({ pathname: '/local-lobby', params: { startView: 'create' } });
  }

  const collectionSubtitle = collections.length > 0
    ? collections.map((c) => c.name).join(' · ')
    : 'Christmas · Horror · The 2010s…';

  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative background */}
      {DECOS.map(({ Component, size, top, left, right, rotate, opacity }, i) => (
        <View
          key={i}
          style={{ position: 'absolute', top: top as any, left: left as any, right: right as any, transform: [{ rotate }] }}
          pointerEvents="none"
        >
          <Component size={size} opacity={opacity} />
        </View>
      ))}

      {/* Top bar */}
      <View style={styles.topBar}>
        <BackButton onPress={() => router.back()} style={{ marginHorizontal: 0, marginTop: 0 }} />
        {authUser && (
          <TouchableOpacity style={styles.accountBtn} onPress={handleAccount}>
            <Text style={styles.accountBtnText}>Account</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.headerGroup}>
          <Text style={styles.overline}>DIGITAL MODE</Text>
          <Text style={styles.heading}>Choose a Mode</Text>
        </View>

        {/* Standard */}
        <TouchableOpacity style={styles.modeCard} onPress={handleStandard} activeOpacity={0.8}>
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Standard</Text>
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>500+ curated movies</Text>
        </TouchableOpacity>

        {/* Collections */}
        <TouchableOpacity style={[styles.modeCard, styles.modeCardPremium]} onPress={handleCollections} activeOpacity={0.8}>
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Collections</Text>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>★ PREMIUM</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>{collectionSubtitle}</Text>
        </TouchableOpacity>

        {/* Insane Mode */}
        <TouchableOpacity style={[styles.modeCard, styles.modeCardPremium]} onPress={handleInsaneMode} activeOpacity={0.8}>
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Insane Mode</Text>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>★ PREMIUM</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>Every movie ever made</Text>
        </TouchableOpacity>

        {/* Coming soon: Who's the Director? */}
        <View style={[styles.modeCard, styles.modeCardDisabled]}>
          <View style={styles.modeRow}>
            <Text style={[styles.modeName, styles.modeNameDisabled]}>Who's the Director?</Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>COMING SOON</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>Guess movies by their director</Text>
        </View>
      </View>

      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPurchased={handlePaywallPurchased}
      />

      {/* Collection picker */}
      <Modal
        visible={collectionPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCollectionPickerVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetOverline}>SELECT A COLLECTION</Text>
            <Text style={styles.sheetTitle}>What's tonight's theme?</Text>
            {loadingCollections ? (
              <ActivityIndicator color={C.gold} style={{ marginVertical: 32 }} />
            ) : (
              <ScrollView style={styles.colList} contentContainerStyle={styles.colListContent}>
                {collections.map((col) => (
                  <TouchableOpacity
                    key={col.id}
                    style={styles.colItem}
                    onPress={() => handleSelectCollection(col)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.colName}>{col.name}</Text>
                    {col.description && (
                      <Text style={styles.colDesc}>{col.description}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <CinemaButton variant="ghost" size="sm" onPress={() => setCollectionPickerVisible(false)}>
              Cancel
            </CinemaButton>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  accountBtn: {},
  accountBtnText: { ...T.caption },

  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SP.lg,
    gap: SP.md - 2,
  },

  headerGroup: {
    alignItems: 'center',
    marginBottom: SP.sm,
    gap: SP.xs,
  },
  overline: { ...T.overline },
  heading: { ...T.display, color: C.textPrimary, textAlign: 'center' },

  // Mode cards
  modeCard: {
    backgroundColor: C.surface,
    borderRadius: R.card,
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
    gap: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeCardPremium: {
    borderColor: C.goldGlow,
    backgroundColor: 'rgba(245,197,24,0.04)',
  },
  modeCardDisabled: { opacity: 0.35 },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  modeName: { ...T.subtitle, color: C.textPrimary, flex: 1 },
  modeNameDisabled: { color: C.textSub },
  modeSub: { ...T.caption },

  freeBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: R.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
  },
  freeBadgeText: { ...T.micro, color: '#4ade80' },

  premiumBadge: {
    backgroundColor: C.goldFaint,
    borderRadius: R.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
  },
  premiumBadgeText: { ...T.micro, color: C.gold },

  soonBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: R.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
  },
  soonBadgeText: { ...T.micro },

  // Collection picker sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surfaceHigh,
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
    padding: SP.lg,
    paddingBottom: SP.xl,
    alignItems: 'center',
    gap: SP.md,
    maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: SP.xs,
  },
  sheetOverline: { ...T.overline },
  sheetTitle: { ...T.title, color: C.textPrimary },
  colList: { width: '100%' },
  colListContent: { gap: SP.sm },
  colItem: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.md,
    gap: 4,
  },
  colName: { ...T.label, color: C.textPrimary },
  colDesc: { ...T.caption },
});
