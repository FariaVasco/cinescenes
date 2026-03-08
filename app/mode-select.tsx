import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { presentPaywall, presentCustomerCenter, checkPremium } from '@/lib/revenuecat';
import { Collection } from '@/lib/database.types';

const db = supabase as unknown as { from: (t: string) => any };

export default function ModeSelectScreen() {
  const router = useRouter();
  const {
    authUser, isPremium, setIsPremium,
    setSelectedGameMode, setSelectedCollectionId,
  } = useAppStore();

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
    router.push('/local-lobby');
  }

  async function handleCollections() {
    if (!authUser) {
      router.push('/sign-in?returnTo=mode-select');
      return;
    }
    if (!isPremium) {
      const purchased = await presentPaywall();
      if (purchased) {
        const premium = await checkPremium();
        setIsPremium(premium);
        if (premium) setCollectionPickerVisible(true);
      }
      return;
    }
    setCollectionPickerVisible(true);
  }

  async function handleAccount() {
    await presentCustomerCenter();
  }

  function handleSelectCollection(col: Collection) {
    setSelectedGameMode('collection');
    setSelectedCollectionId(col.id);
    setCollectionPickerVisible(false);
    router.push('/local-lobby');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        {authUser && (
          <TouchableOpacity style={styles.accountBtn} onPress={handleAccount}>
            <Text style={styles.accountBtnText}>Account</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>Choose a Mode</Text>

        {/* Standard */}
        <TouchableOpacity style={styles.modeCard} onPress={handleStandard} activeOpacity={0.8}>
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Standard Mode</Text>
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>500+ curated movies</Text>
        </TouchableOpacity>

        {/* Collections */}
        <TouchableOpacity style={styles.modeCard} onPress={handleCollections} activeOpacity={0.8}>
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Collections</Text>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>PREMIUM</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>
            {collections.length > 0
              ? collections.map((c) => c.name).join(' · ')
              : 'Christmas · Horror · The 2010s…'}
          </Text>
        </TouchableOpacity>

        {/* Coming soon: Insane Mode */}
        <View style={[styles.modeCard, styles.modeCardDisabled]}>
          <View style={styles.modeRow}>
            <Text style={[styles.modeName, styles.modeNameDisabled]}>Insane Mode</Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>COMING SOON</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>Every movie ever made</Text>
        </View>

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
            <Text style={styles.sheetTitle}>Choose a Collection</Text>
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
            <TouchableOpacity
              onPress={() => setCollectionPickerVisible(false)}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  backBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: FS.base },
  accountBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  accountBtnText: { color: C.textSub, fontSize: FS.sm },
  content: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: 28, gap: 14,
  },
  heading: {
    color: C.textPrimary, fontSize: FS['2xl'], fontWeight: '900',
    marginBottom: 8, textAlign: 'center',
  },
  modeCard: {
    backgroundColor: C.surface, borderRadius: R.card,
    padding: 20, gap: 6,
    borderWidth: 1, borderColor: C.border,
  },
  modeCardDisabled: { opacity: 0.4 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeName: { color: C.textPrimary, fontSize: FS.lg, fontWeight: '800', flex: 1 },
  modeNameDisabled: { color: C.textSub },
  modeSub: { color: C.textMuted, fontSize: FS.sm },
  freeBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: R.xs,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  freeBadgeText: { color: '#4ade80', fontSize: FS.xs, fontWeight: '800', letterSpacing: 0.5 },
  premiumBadge: {
    backgroundColor: C.goldFaint, borderRadius: R.xs,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  premiumBadgeText: { color: C.gold, fontSize: FS.xs, fontWeight: '800', letterSpacing: 0.5 },
  soonBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: R.xs,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  soonBadgeText: { color: C.textMuted, fontSize: FS.xs, fontWeight: '700', letterSpacing: 0.5 },

  // Collection picker sheet
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.card, borderTopRightRadius: R.card,
    padding: 24, paddingBottom: 40, alignItems: 'center', gap: 16, maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, marginBottom: 4,
  },
  sheetTitle: { color: C.textPrimary, fontSize: FS.xl, fontWeight: '900' },
  colList: { width: '100%' },
  colListContent: { gap: 10 },
  colItem: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: R.md,
    borderWidth: 1, borderColor: C.border, padding: 16, gap: 4,
  },
  colName: { color: C.textPrimary, fontSize: FS.md, fontWeight: '700' },
  colDesc: { color: C.textMuted, fontSize: FS.sm },
  dismissBtn: { paddingVertical: 8 },
  dismissText: { color: C.textMuted, fontSize: FS.sm },
});
