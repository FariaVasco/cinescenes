import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert,
} from 'react-native';
import Purchases, { PurchasesPackage, PackageType } from 'react-native-purchases';
import { C, R, T, SP } from '@/constants/theme';
import { CinemaButton } from '@/components/CinemaButton';
import { ENTITLEMENT_ID } from '@/lib/revenuecat';
import { DecoFilmReel, DecoClapperboard } from '@/components/CinemaIcons';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPurchased: () => void;
}

interface Plan {
  pkg: PurchasesPackage;
  label: string;
  price: string;
  detail: string;
  badge?: string;
}

function buildPlans(packages: PurchasesPackage[]): Plan[] {
  const order = [PackageType.ANNUAL, PackageType.LIFETIME, PackageType.MONTHLY];
  const sorted = [...packages].sort(
    (a, b) => order.indexOf(a.packageType as PackageType) - order.indexOf(b.packageType as PackageType)
  );
  return sorted.map((pkg) => {
    const price = pkg.product.priceString;
    switch (pkg.packageType as PackageType) {
      case PackageType.MONTHLY:
        return { pkg, label: 'Monthly', price, detail: 'per month', badge: undefined };
      case PackageType.ANNUAL:
        return { pkg, label: 'Annual', price, detail: 'per year', badge: 'BEST VALUE' };
      case PackageType.LIFETIME:
        return { pkg, label: 'Lifetime', price, detail: 'one-time', badge: 'FOREVER' };
      default:
        return { pkg, label: pkg.product.title, price, detail: '', badge: undefined };
    }
  });
}

export function PaywallSheet({ visible, onClose, onPurchased }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (visible) loadOfferings();
  }, [visible]);

  async function loadOfferings() {
    setLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current?.availablePackages.length) {
        const built = buildPlans(offerings.current.availablePackages);
        setPlans(built);
        setSelected(built[0]?.pkg.identifier ?? null);
      }
    } catch {
      // offerings unavailable — show fallback UI
    }
    setLoading(false);
  }

  async function handleSubscribe() {
    const plan = plans.find((p) => p.pkg.identifier === selected);
    if (!plan) return;
    setPurchasing(true);
    try {
      await Purchases.purchasePackage(plan.pkg);
      onPurchased();
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase failed', e.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    try {
      const info = await Purchases.restorePurchases();
      if (info.entitlements.active[ENTITLEMENT_ID]) {
        onPurchased();
      } else {
        Alert.alert('Nothing to restore', 'No active subscription found for this account.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e.message ?? 'Could not restore purchases.');
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Decorative background */}
          <View style={styles.decoTL} pointerEvents="none">
            <DecoClapperboard size={80} opacity={0.06} />
          </View>
          <View style={styles.decoTR} pointerEvents="none">
            <DecoFilmReel size={72} opacity={0.06} />
          </View>

          <View style={styles.handle} />

          <View style={styles.headerGroup}>
            <Text style={styles.overline}>CINESCENES PREMIUM</Text>
            <Text style={styles.title}>Unlock Everything</Text>
            <Text style={styles.subtitle}>
              Themed collections, and everything{'\n'}we add in the future
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={C.gold} style={styles.loader} />
          ) : plans.length === 0 ? (
            <Text style={styles.errorText}>Pricing unavailable — please try again later.</Text>
          ) : (
            <View style={styles.plans}>
              {plans.map((plan) => {
                const isSelected = plan.pkg.identifier === selected;
                return (
                  <TouchableOpacity
                    key={plan.pkg.identifier}
                    style={[styles.planRow, isSelected && styles.planRowSelected]}
                    onPress={() => setSelected(plan.pkg.identifier)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.planLeft}>
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <View>
                        <Text style={[styles.planLabel, isSelected && styles.planLabelSelected]}>
                          {plan.label}
                        </Text>
                        <Text style={styles.planDetail}>{plan.detail}</Text>
                      </View>
                    </View>
                    <View style={styles.planRight}>
                      <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                        {plan.price}
                      </Text>
                      {plan.badge && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{plan.badge}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <CinemaButton
            size="lg"
            onPress={handleSubscribe}
            disabled={purchasing || loading || plans.length === 0}
            style={styles.cta}
          >
            {purchasing ? '…' : 'GET PREMIUM'}
          </CinemaButton>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestore} disabled={purchasing}>
              <Text style={styles.restoreText}>Restore purchases</Text>
            </TouchableOpacity>
            <Text style={styles.dot}>·</Text>
            <TouchableOpacity onPress={onClose} disabled={purchasing}>
              <Text style={styles.cancelText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surfaceHigh,
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
    paddingHorizontal: SP.lg,
    paddingBottom: SP.xl + SP.md,
    paddingTop: SP.md,
    overflow: 'hidden',
  },

  // Decorative icons
  decoTL: { position: 'absolute', top: -8, left: -8, transform: [{ rotate: '-15deg' }] },
  decoTR: { position: 'absolute', top: -4, right: -4, transform: [{ rotate: '10deg' }] },

  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: SP.lg,
  },

  headerGroup: {
    alignItems: 'center',
    gap: SP.sm,
    marginBottom: SP.lg,
  },
  overline: { ...T.overline },
  title: { ...T.display, color: C.textPrimary, textAlign: 'center' },
  subtitle: { ...T.body, textAlign: 'center' },

  loader: { marginVertical: SP.xl },
  errorText: { ...T.caption, textAlign: 'center', marginVertical: SP.xl },

  plans: { gap: SP.sm, marginBottom: SP.lg },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: SP.md,
    paddingHorizontal: SP.md,
  },
  planRowSelected: {
    borderColor: C.gold,
    backgroundColor: C.goldFaint,
  },

  planLeft: { flexDirection: 'row', alignItems: 'center', gap: SP.md },
  radio: {
    width: 20, height: 20,
    borderRadius: R.full,
    borderWidth: 2,
    borderColor: C.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: C.gold },
  radioDot: {
    width: 10, height: 10,
    borderRadius: R.full,
    backgroundColor: C.gold,
  },
  planLabel: { ...T.label, color: C.textSub },
  planLabelSelected: { color: C.textPrimary },
  planDetail: { ...T.caption },

  planRight: { alignItems: 'flex-end', gap: 4 },
  planPrice: { ...T.subtitle, color: C.textSub },
  planPriceSelected: { color: C.gold },
  badge: {
    backgroundColor: C.goldFaint,
    borderRadius: R.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { ...T.micro, color: C.gold },

  cta: { width: '100%', marginBottom: SP.md },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SP.sm,
  },
  restoreText: { ...T.caption },
  dot: { ...T.caption },
  cancelText: { ...T.caption },
});
