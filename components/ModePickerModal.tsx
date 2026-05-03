import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Image,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { C, R, T, SP, Fonts, FS } from '@/constants/theme';
import { CinemaButton } from '@/components/CinemaButton';
import { PaywallSheet } from '@/components/PaywallSheet';
import { checkPremium } from '@/lib/revenuecat';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Collection } from '@/lib/database.types';

const lcLightning = require('@/assets/lc-lightning.png');

const db = supabase as unknown as { from: (t: string) => any };

export type ModeChoice =
  | { mode: 'classic' }
  | { mode: 'insane' }
  | { mode: 'collection'; collectionId: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelected: (choice: ModeChoice) => void;
}

export function ModePickerModal({ visible, onClose, onSelected }: Props) {
  const router = useRouter();
  const { authUser, isPremium, setIsPremium } = useAppStore();

  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallPendingMode, setPaywallPendingMode] = useState<'insane' | 'collection'>('insane');
  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  useEffect(() => {
    if (visible) loadCollections();
  }, [visible]);

  async function loadCollections() {
    setLoadingCollections(true);
    const { data } = await db
      .from('collections')
      .select('*')
      .eq('is_active', true) as { data: Collection[] | null };
    if (data) setCollections(data);
    setLoadingCollections(false);
  }

  function pickClassic() {
    onSelected({ mode: 'classic' });
    onClose();
  }

  // TEMPORARY: Insane Mode is open to everyone (no auth, no paywall) while we test it.
  // To restore the premium gate, uncomment the original auth + isPremium checks below.
  function pickInsane() {
    // if (!authUser) { onClose(); router.push('/sign-in?returnTo=local'); return; }
    // if (!isPremium) { setPaywallPendingMode('insane'); setPaywallVisible(true); return; }
    onSelected({ mode: 'insane' });
    onClose();
  }

  function pickCollection() {
    if (!authUser) {
      onClose();
      router.push('/sign-in?returnTo=local');
      return;
    }
    if (!isPremium) {
      setPaywallPendingMode('collection');
      setPaywallVisible(true);
      return;
    }
    setCollectionPickerVisible(true);
  }

  async function onPaywallPurchased() {
    setPaywallVisible(false);
    const premium = await checkPremium();
    setIsPremium(premium);
    if (!premium) return;
    if (paywallPendingMode === 'insane') {
      onSelected({ mode: 'insane' });
      onClose();
    } else {
      setCollectionPickerVisible(true);
    }
  }

  function onCollectionPicked(col: Collection) {
    setCollectionPickerVisible(false);
    onSelected({ mode: 'collection', collectionId: col.id });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.overline}>SELECT GAME MODE</Text>
          <Text style={styles.title}>Choose a Mode</Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.tile, styles.tileClassic]} onPress={pickClassic} activeOpacity={0.85}>
              <Text style={styles.tileTitle}>Classic</Text>
              <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>FREE</Text></View>
              <Text style={styles.tileSub}>500+ curated movies</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tile} onPress={pickInsane} activeOpacity={0.85}>
              <Text style={styles.tileTitle}>Insane</Text>
              <View style={styles.premiumBadge}>
                <Image source={lcLightning} style={styles.premiumBadgeIcon} />
                <Text style={styles.premiumBadgeText}>PREMIUM</Text>
              </View>
              <Text style={styles.tileSub}>Every movie ever made</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.tile, styles.tileDisabled]} onPress={pickCollection} activeOpacity={0.85} disabled>
              <Text style={[styles.tileTitle, styles.tileTitleDisabled]}>Collections</Text>
              <View style={styles.soonBadge}><Text style={styles.soonBadgeText}>COMING SOON</Text></View>
              <Text style={styles.tileSub}>Themed packs</Text>
            </TouchableOpacity>
          </View>

          <CinemaButton variant="ghost" size="sm" onPress={onClose}>Cancel</CinemaButton>
        </View>
      </TouchableOpacity>

      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPurchased={onPaywallPurchased}
      />

      <Modal visible={collectionPickerVisible} transparent animationType="slide" onRequestClose={() => setCollectionPickerVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.collectionSheet}>
            <Text style={styles.overline}>SELECT A COLLECTION</Text>
            <Text style={styles.title}>Tonight's theme</Text>
            {loadingCollections ? (
              <ActivityIndicator color={C.ochre} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ width: '100%' }} contentContainerStyle={{ gap: SP.sm }}>
                {collections.map((col) => (
                  <TouchableOpacity key={col.id} style={styles.colItem} onPress={() => onCollectionPicked(col)} activeOpacity={0.85}>
                    <Text style={styles.colName}>{col.name}</Text>
                    {col.description && <Text style={styles.colDesc}>{col.description}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <CinemaButton variant="ghost" size="sm" onPress={() => setCollectionPickerVisible(false)}>Cancel</CinemaButton>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SP.lg,
  },
  card: {
    backgroundColor: C.surfaceHigh,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    padding: SP.lg,
    width: '100%',
    maxWidth: 720,
    gap: SP.md,
    alignItems: 'center',
  },
  overline: { ...T.overline },
  title: { ...T.display, color: C.textPrimary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    gap: SP.sm,
    width: '100%',
  },
  tile: {
    flex: 1,
    backgroundColor: C.surfaceWarm,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    padding: SP.md,
    gap: 6,
    alignItems: 'center',
    minHeight: 110,
  },
  tileClassic: {},
  tileDisabled: { opacity: 0.4 },
  tileTitle: { ...T.subtitle, color: C.textPrimary },
  tileTitleDisabled: { color: C.textSub },
  tileSub: { ...T.caption, textAlign: 'center' },
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

  collectionSheet: {
    backgroundColor: C.surfaceHigh,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    padding: SP.lg,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    gap: SP.sm,
    alignItems: 'center',
  },
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
