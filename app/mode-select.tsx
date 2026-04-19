import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, T, SP, Fonts, FS } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { presentCustomerCenter, checkPremium } from '@/lib/revenuecat';
import { Collection } from '@/lib/database.types';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';
import { PaywallSheet } from '@/components/PaywallSheet';

const lcFilmReel     = require('@/assets/lc-film-reel.png');
const lcClapperboard = require('@/assets/lc-clapperboard.png');
const lcPopcorn      = require('@/assets/lc-popcorn.png');
const lcSpotlight    = require('@/assets/lc-spotlight.png');
const lcFilmStrip    = require('@/assets/lc-film-strip.png');
const lcTrophy       = require('@/assets/lc-trophy.png');
const lcLightning    = require('@/assets/lc-lightning.png');
const lcLock         = require('@/assets/lc-lock.png');
const lcGlobePin     = require('@/assets/lc-globe.png');

const db = supabase as unknown as { from: (t: string) => any };

const DECOS = [
  { src: lcFilmReel,     size: 96, top: '3%',  right: '3%',  rotate: '12deg'  },
  { src: lcClapperboard, size: 80, top: '5%',  left: '2%',   rotate: '-8deg'  },
  { src: lcPopcorn,      size: 44, top: '55%', left: '4%',   rotate: '20deg'  },
  { src: lcFilmReel,     size: 68, top: '72%', right: '4%',  rotate: '-14deg' },
  { src: lcSpotlight,    size: 60, top: '38%', right: '5%',  rotate: '-6deg'  },
  { src: lcTrophy,       size: 52, top: '84%', left: '10%',  rotate: '8deg'   },
  { src: lcFilmStrip,    size: 56, top: '20%', left: '3%',   rotate: '4deg'   },
];

export default function ModeSelectScreen() {
  const router = useRouter();
  const { displayName } = useLocalSearchParams<{ displayName?: string }>();
  const {
    authUser, isPremium, setIsPremium,
    setSelectedGameMode, setSelectedCollectionId, setSelectedVisibility,
    selectedCollectionId,
  } = useAppStore();

  const [localMode, setLocalMode] = useState<'classic' | 'collection' | 'insane'>('classic');
  const [localVisibility, setLocalVisibility] = useState<'invite_only' | 'public'>('invite_only');
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

  async function handleInsaneTap() {
    if (!authUser) {
      router.push('/sign-in?returnTo=mode-select');
      return;
    }
    if (!isPremium) {
      setPaywallPendingMode('insane');
      setPaywallVisible(true);
      return;
    }
    setLocalMode('insane');
  }

  async function handlePaywallPurchased() {
    setPaywallVisible(false);
    const premium = await checkPremium();
    setIsPremium(premium);
    if (premium) {
      if (paywallPendingMode === 'insane') {
        setLocalMode('insane');
      } else {
        setCollectionPickerVisible(true);
      }
    }
  }

  function handleSelectCollection(col: Collection) {
    setSelectedCollectionId(col.id);
    setLocalMode('collection');
    setCollectionPickerVisible(false);
  }

  function handleCreateGame() {
    if (localMode === 'collection' && !selectedCollectionId) {
      setCollectionPickerVisible(true);
      return;
    }
    setSelectedGameMode(localMode);
    if (localMode !== 'collection') setSelectedCollectionId(null);
    setSelectedVisibility(localVisibility);
    router.replace({ pathname: '/local-lobby', params: { startView: 'create', displayName: displayName ?? '' } });
  }

  const collectionSubtitle = collections.length > 0
    ? collections.map((c) => c.name).join(' · ')
    : 'Christmas · Horror · The 2010s…';

  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative background */}
      {DECOS.map(({ src, size, top, left, right, rotate }, i) => (
        <View
          key={i}
          style={{ position: 'absolute', top: top as any, left: left as any, right: right as any, transform: [{ rotate }] }}
          pointerEvents="none"
        >
          <Image source={src} style={{ width: size, height: size, resizeMode: 'contain', opacity: 0.1 }} />
        </View>
      ))}

      {/* Top bar */}
      <View style={styles.topBar}>
        <BackButton onPress={() => router.back()} style={{ marginHorizontal: 0, marginTop: 0 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.headerGroup}>
          <Text style={styles.overline}>GAME SETUP</Text>
          <Text style={styles.heading}>Choose a Mode</Text>
        </View>

        {/* Classic */}
        <TouchableOpacity
          style={[styles.modeCard, localMode === 'classic' && styles.modeCardSelected]}
          onPress={() => setLocalMode('classic')}
          activeOpacity={0.8}
        >
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Classic</Text>
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
            {localMode === 'classic' && (
              <View style={styles.checkBadge}><Text style={styles.checkBadgeText}>✓</Text></View>
            )}
          </View>
          <Text style={[styles.modeSub, localMode === 'classic' && styles.modeSubSelected]}>500+ curated movies · Safe trailers, no spoilers</Text>
        </TouchableOpacity>

        {/* Insane Mode */}
        <TouchableOpacity
          style={[styles.modeCard, styles.modeCardPremium, localMode === 'insane' && styles.modeCardSelected]}
          onPress={handleInsaneTap}
          activeOpacity={0.8}
        >
          <View style={styles.modeRow}>
            <Text style={styles.modeName}>Insane Mode</Text>
            <View style={styles.premiumBadge}>
              <Image source={lcLightning} style={styles.premiumBadgeIcon} />
              <Text style={styles.premiumBadgeText}>PREMIUM</Text>
            </View>
            {localMode === 'insane' && (
              <View style={styles.checkBadge}><Text style={styles.checkBadgeText}>✓</Text></View>
            )}
          </View>
          <Text style={[styles.modeSub, localMode === 'insane' && styles.modeSubSelected]}>Every movie ever made · Unverified trailers</Text>
          <Text style={styles.modeDisclaimer}>Clips may reveal the title, year, or director — use your judgement</Text>
        </TouchableOpacity>

        {/* Collections — coming soon */}
        <View style={[styles.modeCard, styles.modeCardDisabled]}>
          <View style={styles.modeRow}>
            <Text style={[styles.modeName, styles.modeNameDisabled]}>Collections</Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>COMING SOON</Text>
            </View>
          </View>
          <Text style={styles.modeSub}>{collectionSubtitle}</Text>
        </View>

        {/* Visibility toggle */}
        <View style={styles.visibilitySection}>
          <Text style={styles.visibilityLabel}>VISIBILITY</Text>
          <View style={styles.visibilityToggle}>
            <TouchableOpacity
              style={[styles.visibilityOption, localVisibility === 'invite_only' && styles.visibilityOptionActive]}
              onPress={() => setLocalVisibility('invite_only')}
              activeOpacity={0.8}
            >
              <Image source={lcLock} style={styles.visibilityIcon} />
              <Text style={[styles.visibilityOptionText, localVisibility === 'invite_only' && styles.visibilityOptionTextActive]}>
                Private
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.visibilityOption, localVisibility === 'public' && styles.visibilityOptionActive]}
              onPress={() => setLocalVisibility('public')}
              activeOpacity={0.8}
            >
              <Image source={lcGlobePin} style={styles.visibilityIcon} />
              <Text style={[styles.visibilityOptionText, localVisibility === 'public' && styles.visibilityOptionTextActive]}>
                Public
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.ctaBar}>
        <CinemaButton size="lg" onPress={handleCreateGame}>
          Create Game →
        </CinemaButton>
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
              <ActivityIndicator color={C.ochre} style={{ marginVertical: 32 }} />
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
  heading: { ...T.display, color: C.textPrimary, textAlign: 'center', alignSelf: 'stretch' },

  // Mode cards
  modeCard: {
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
    gap: 5,
    borderWidth: 2,
    borderColor: C.ink,
  },
  modeCardPremium: {},
  modeCardSelected: {
    borderColor: C.ochre,
    borderWidth: 3,
    backgroundColor: C.ochre,
  },
  modeSubSelected: { color: C.ink },
  modeCardDisabled: { opacity: 0.35 },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  modeName: { ...T.subtitle, color: C.textPrimary, flex: 1 },
  modeNameDisabled: { color: C.textSub },
  modeSub: { ...T.caption },
  modeDisclaimer: { ...T.micro, color: C.textSub, opacity: 0.6 },

  freeBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: R.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
  },
  freeBadgeText: { ...T.micro, color: '#4ade80' },

  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.goldFaint,
    borderRadius: R.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
  },
  premiumBadgeIcon: { width: 12, height: 12, resizeMode: 'contain' },
  premiumBadgeText: { ...T.micro, color: C.gold },

  soonBadge: {
    backgroundColor: C.inkFaint,
    borderRadius: R.xs,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
  },
  soonBadgeText: { ...T.micro },

  checkBadge: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: C.ink,
    borderWidth: 1,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.ink,
  },

  // Visibility toggle
  visibilitySection: { gap: 6 },
  visibilityLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.textMuted,
  },
  visibilityToggle: {
    flexDirection: 'row',
    backgroundColor: C.surfaceWarm,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    overflow: 'hidden',
  },
  visibilityOption: {
    flex: 1,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  visibilityOptionActive: { backgroundColor: C.ochre },
  visibilityOptionText: {
    fontFamily: Fonts.label,
    color: C.textSub,
    fontSize: FS.sm,
  },
  visibilityOptionTextActive: { color: C.textOnOchre },
  visibilityIcon: { width: 16, height: 16, resizeMode: 'contain' },

  // CTA bar
  ctaBar: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.md,
  },

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
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: C.ink,
    padding: SP.lg,
    paddingBottom: SP.xl,
    alignItems: 'center',
    gap: SP.md,
    maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: C.inkFaint,
    marginBottom: SP.xs,
  },
  sheetOverline: { ...T.overline },
  sheetTitle: { ...T.title, color: C.textPrimary },
  colList: { width: '100%' },
  colListContent: { gap: SP.sm },
  colItem: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    padding: SP.md,
    gap: 4,
  },
  colName: { ...T.label, color: C.textPrimary },
  colDesc: { ...T.caption },
});
