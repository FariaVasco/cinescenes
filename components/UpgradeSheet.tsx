import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import Purchases, { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { C, R, FS } from '@/constants/theme';
import { getOfferings, checkPremium } from '@/lib/revenuecat';
import { useAppStore } from '@/store/useAppStore';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
}

export function UpgradeSheet({ visible, onDismiss, onSuccess }: Props) {
  const { setIsPremium } = useAppStore();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getOfferings().then((o) => {
      const current = o.current;
      if (current) {
        setOffering(current);
        setSelected(current.availablePackages[0] ?? null);
      }
    });
  }, [visible]);

  async function handlePurchase() {
    if (!selected) return;
    setLoading(true);
    try {
      await Purchases.purchasePackage(selected);
      const premium = await checkPremium();
      if (premium) {
        setIsPremium(true);
        onSuccess();
      }
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert('Purchase failed', e?.message ?? 'Could not complete purchase');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    setLoading(true);
    try {
      await Purchases.restorePurchases();
      const premium = await checkPremium();
      if (premium) {
        setIsPremium(true);
        onSuccess();
      } else {
        Alert.alert('No active subscription found');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message ?? 'Could not restore purchases');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.subtitle}>Collections, themed packs & more</Text>

          {!offering ? (
            <ActivityIndicator color={C.gold} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView style={styles.packages} contentContainerStyle={styles.packagesContent}>
              {offering.availablePackages.map((pkg) => {
                const isSelected = selected?.identifier === pkg.identifier;
                return (
                  <TouchableOpacity
                    key={pkg.identifier}
                    style={[styles.pkg, isSelected && styles.pkgSelected]}
                    onPress={() => setSelected(pkg)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pkgTitle, isSelected && styles.pkgTitleSelected]}>
                      {pkg.product.title}
                    </Text>
                    <Text style={[styles.pkgPrice, isSelected && styles.pkgPriceSelected]}>
                      {pkg.product.priceString}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={handlePurchase}
            disabled={loading || !selected}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.textOnGold} />
            ) : (
              <Text style={styles.ctaText}>Start 30-Day Free Trial</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestore} disabled={loading} style={styles.restoreBtn}>
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: R.card, borderTopRightRadius: R.card,
    padding: 24, paddingBottom: 40, gap: 16, alignItems: 'center',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, marginBottom: 4,
  },
  title: { color: C.textPrimary, fontSize: FS.xl, fontWeight: '900' },
  subtitle: { color: C.textSub, fontSize: FS.base, textAlign: 'center' },
  packages: { width: '100%' },
  packagesContent: { gap: 10 },
  pkg: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: R.md, borderWidth: 1, borderColor: C.border,
    padding: 16, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pkgSelected: { borderColor: C.gold, backgroundColor: C.goldFaint },
  pkgTitle: { color: C.textSub, fontSize: FS.base, fontWeight: '600' },
  pkgTitleSelected: { color: C.textPrimary },
  pkgPrice: { color: C.textMuted, fontSize: FS.base, fontWeight: '700' },
  pkgPriceSelected: { color: C.gold },
  cta: {
    width: '100%', backgroundColor: C.gold, borderRadius: R.btn,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '800', letterSpacing: 0.3 },
  restoreBtn: { paddingVertical: 8 },
  restoreText: { color: C.textSub, fontSize: FS.sm, textDecorationLine: 'underline' },
  dismissBtn: { paddingVertical: 4 },
  dismissText: { color: C.textMuted, fontSize: FS.sm },
});
