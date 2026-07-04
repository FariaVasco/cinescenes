import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert, useWindowDimensions, Platform,
} from 'react-native';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { ENTITLEMENT_ID } from '@/lib/revenuecat';
import { CloseIcon } from '@/components/CinemaIcons';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPurchased: (isPremium: boolean) => void;
  /** Dev-only: render with mock plans (skips RevenueCat fetch). Use for paywall design iteration on simulator. */
  mockPlans?: Plan[];
}

export interface Plan {
  pkg: PurchasesPackage | null;
  label: string;        // e.g. 'Monthly', 'Annual', 'Lifetime'
  price: string;        // big primary price, e.g. '€3.59'
  detail: string;       // small text under label, e.g. 'Save 30%'
  priceUnit: string;    // small text under price, e.g. '/ MONTH'
  badge?: string;       // floating badge label, e.g. 'BEST VALUE'
}

function annualSavingsDetail(annualPrice: number, monthlyPrice: number): string {
  if (!annualPrice || !monthlyPrice) return '';
  const projectedAnnual = monthlyPrice * 12;
  if (projectedAnnual <= annualPrice) return '';
  const percentOff = Math.round(((projectedAnnual - annualPrice) / projectedAnnual) * 100);
  return percentOff > 0 ? `Save ${percentOff}%` : '';
}

function annualPerMonthUnit(annualPrice: number, currencySymbol: string): string {
  if (!annualPrice) return '';
  const monthly = annualPrice / 12;
  return `${currencySymbol}${monthly.toFixed(2)}/mo`;
}

function buildPlans(offering: PurchasesOffering): Plan[] {
  const plans: Plan[] = [];
  const monthlyPrice = offering.monthly?.product.price;
  if (offering.monthly) {
    plans.push({
      pkg: offering.monthly,
      label: 'Monthly',
      price: offering.monthly.product.priceString,
      detail: '',
      priceUnit: '',
    });
  }
  if (offering.annual) {
    const symbol = offering.annual.product.priceString.replace(/[\d.,\s]/g, '');
    plans.push({
      pkg: offering.annual,
      label: 'Annual',
      price: offering.annual.product.priceString,
      detail: annualSavingsDetail(offering.annual.product.price, monthlyPrice ?? 0),
      priceUnit: annualPerMonthUnit(offering.annual.product.price, symbol),
      badge: 'BEST VALUE',
    });
  }
  if (offering.lifetime) {
    plans.push({
      pkg: offering.lifetime,
      label: 'Lifetime',
      price: offering.lifetime.product.priceString,
      detail: 'Pay once. Yours forever.',
      priceUnit: '',
    });
  }
  return plans;
}

export function PaywallSheet({ visible, onClose, onPurchased, mockPlans }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  // Preselect Annual when available; fall back to first plan otherwise.
  function pickDefault(list: Plan[]): string | null {
    const annual = list.find((p) => p.label === 'Annual');
    const target = annual ?? list[0];
    return target ? (target.pkg?.identifier ?? target.label) : null;
  }

  function planKey(p: Plan): string {
    return p.pkg?.identifier ?? p.label;
  }

  useEffect(() => {
    if (!visible) return;
    if (mockPlans) {
      setPlans(mockPlans);
      setSelected(pickDefault(mockPlans));
      setLoading(false);
      return;
    }
    loadOfferings();
  }, [visible, mockPlans]);

  async function loadOfferings() {
    setLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      console.log('[Paywall] offerings.current:', JSON.stringify(offerings.current, null, 2));
      console.log('[Paywall] all offerings:', Object.keys(offerings.all));
      if (offerings.current) {
        const built = buildPlans(offerings.current);
        setPlans(built);
        setSelected(pickDefault(built));
      } else {
        console.log('[Paywall] No current offering returned');
      }
    } catch (e) {
      console.log('[Paywall] offerings error:', e);
      if (__DEV__) {
        // Dev fallback: RevenueCat unconfigured (e.g. iOS sim with no key)
        // — render mock plans so paywall design can still be iterated on.
        const fallback: Plan[] = [
          { pkg: null, label: 'Monthly',  price: '€3.59',  detail: '',                          priceUnit: '' },
          { pkg: null, label: 'Annual',   price: '€29.99', detail: 'Save 30%',                  priceUnit: '€2.50/mo', badge: 'BEST VALUE' },
          { pkg: null, label: 'Lifetime', price: '€59.99', detail: 'Pay once. Yours forever.', priceUnit: '' },
        ];
        setPlans(fallback);
        setSelected(pickDefault(fallback));
      }
    }
    setLoading(false);
  }

  async function handleSubscribe() {
    const plan = plans.find((p) => planKey(p) === selected);
    if (!plan) return;
    if (!plan.pkg) {
      // Mock plan (only reachable in __DEV__, e.g. iOS simulator or /debug-paywall).
      // Grant a fake premium locally so downstream flows (Insane mode, Collections)
      // can be tested without a real Play purchase.
      if (__DEV__) {
        onPurchased(true);
        return;
      }
      Alert.alert('Preview mode', 'This is a mock plan. Real purchases are disabled here.');
      return;
    }
    setPurchasing(true);
    try {
      const result = await Purchases.purchasePackage(plan.pkg);
      const isActive = result.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      onPurchased(isActive);
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
      const isActive = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
      if (isActive) {
        onPurchased(true);
      } else {
        Alert.alert('Nothing to restore', 'No active subscription found for this account.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e.message ?? 'Could not restore purchases.');
    } finally {
      setPurchasing(false);
    }
  }

  const selectedPlan = plans.find((p) => planKey(p) === selected);
  const ctaLabel = purchasing
    ? '…'
    : selectedPlan
    ? `START PREMIUM · ${selectedPlan.price}`
    : 'START PREMIUM';
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Play Store';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, landscape && styles.sheetLandscape]}>
          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <CloseIcon size={16} color={C.ink} />
          </TouchableOpacity>

          {(() => {
            const FooterBlock = (
              <View style={landscape ? styles.footerLandscape : styles.footer}>
                <TouchableOpacity onPress={handleRestore} disabled={purchasing} hitSlop={8}>
                  <Text style={styles.footerLink}>RESTORE PURCHASE</Text>
                </TouchableOpacity>
                <Text style={styles.footerInfo}>CANCEL ANYTIME · {storeName.toUpperCase()}</Text>
              </View>
            );

            return (
              <View style={landscape ? styles.landscapeRow : undefined}>
                {/* LEFT (or top in portrait): Header (and footer text in landscape) */}
                <View style={landscape ? styles.landscapeLeft : undefined}>
                  <View style={landscape ? styles.landscapeLeftHeader : undefined}>
                    <View style={[styles.header, landscape && styles.headerLandscape]}>
                      <Text style={[styles.title, landscape && styles.titleLandscape]}>
                        Unlock every mode 
                      </Text>
                      <Text style={[styles.subtitle, landscape && styles.subtitleLandscape]}>
                        Insane mode is a premium feature. Subscribe to access everything.
                      </Text>
                    </View>
                  </View>
                  {landscape ? FooterBlock : null}
                </View>

                {/* RIGHT (or bottom in portrait): Plans + CTA (+ footer in portrait) */}
                <View style={landscape ? styles.landscapeRight : undefined}>
                  {loading ? (
                    <ActivityIndicator color={C.ochre} style={styles.loader} />
                  ) : plans.length === 0 ? (
                    <Text style={styles.errorText}>Pricing unavailable — please try again later.</Text>
                  ) : (
                    <View style={[styles.plans, landscape && styles.plansLandscape]}>
                      {plans.map((plan) => {
                        const key = planKey(plan);
                        const isSelected = key === selected;
                        return (
                          <View key={key} style={styles.planWrap}>
                            <TouchableOpacity
                              style={[
                                styles.planRow,
                                landscape && styles.planRowLandscape,
                                isSelected ? styles.planRowSelected : styles.planRowUnselected,
                              ]}
                              onPress={() => setSelected(key)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.planLeft}>
                                <View style={styles.planLabelRow}>
                                  <Text style={[styles.planLabel, isSelected ? styles.planLabelSelected : styles.planLabelUnselected]}>
                                    {plan.label.toUpperCase()}
                                  </Text>
                                  {plan.badge ? (
                                    <View style={styles.badgeInline}>
                                      <Text style={styles.badgeText}>{plan.badge}</Text>
                                    </View>
                                  ) : null}
                                </View>
                                {plan.detail ? (
                                  <Text style={[styles.planDetail, isSelected ? styles.planDetailSelected : styles.planDetailUnselected]}>
                                    {plan.detail.toUpperCase()}
                                  </Text>
                                ) : null}
                              </View>
                              <View style={styles.planRight}>
                                <Text style={[styles.planPrice, isSelected ? styles.planPriceSelected : styles.planPriceUnselected]}>
                                  {plan.price}
                                </Text>
                                {plan.priceUnit ? (
                                  <Text style={[styles.planPriceUnit, isSelected ? styles.planDetailSelected : styles.planDetailUnselected]}>
                                    {plan.priceUnit.toUpperCase()}
                                  </Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* CTA */}
                  <TouchableOpacity
                    style={[styles.cta, (purchasing || loading || plans.length === 0) && styles.ctaDisabled]}
                    onPress={handleSubscribe}
                    disabled={purchasing || loading || plans.length === 0}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                  </TouchableOpacity>

                  {!landscape ? FooterBlock : null}
                </View>
              </View>
            );
          })()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SP.md,
  },
  sheet: {
    backgroundColor: C.surfaceHigh,
    borderRadius: R.sheet,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.md,
    paddingVertical: SP.md,
    width: '100%',
    maxWidth: 480,
    overflow: 'visible',
  },
  sheetLandscape: {
    maxWidth: 540,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
  },

  // Two-column landscape layout
  landscapeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SP.sm,
  },
  landscapeLeft: {
    flex: 1,
    paddingVertical: 4,
  },
  landscapeLeftHeader: {
    flex: 1,
    justifyContent: 'center',
  },
  landscapeRight: {
    flex: 1.3,
    paddingTop: 24,
  },

  // Close button (top-right)
  closeBtn: {
    position: 'absolute',
    top: SP.xs,
    right: SP.xs,
    width: 26, height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  // Header
  header: {
    alignItems: 'center',
    gap: 4,
    marginBottom: SP.sm,
  },
  headerLandscape: {
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: C.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  titleLandscape: {
    fontSize: 28,
    textAlign: 'left',
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: Fonts.label,
    fontSize: 13,
    color: C.textSub,
    lineHeight: 17,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  subtitleLandscape: {
    textAlign: 'left',
    fontSize: 13,
    lineHeight: 17,
  },

  loader: { marginVertical: SP.lg },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    color: C.textSub,
    textAlign: 'center',
    marginVertical: SP.lg,
  },

  // Plan rows
  plans: { gap: 6, marginBottom: SP.sm },
  plansLandscape: { gap: 5, marginBottom: SP.xs },
  planWrap: { position: 'relative' },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: R.md,
    paddingVertical: 8,
    paddingHorizontal: SP.md,
    borderWidth: 1.5,
  },
  planRowLandscape: {
    paddingVertical: 6,
    paddingHorizontal: SP.sm + 4,
  },
  planRowUnselected: {
    backgroundColor: C.surface,
    borderColor: C.ink,
  },
  planRowSelected: {
    backgroundColor: C.ochre,
    borderColor: C.ink,
  },

  planLeft: { flex: 1, gap: 2 },
  planLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planLabel: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    letterSpacing: 0.5,
    lineHeight: 20,
  },
  planLabelUnselected: { color: C.textPrimary },
  planLabelSelected:   { color: C.ink },
  planDetail: {
    fontFamily: Fonts.label,
    fontSize: 9,
    letterSpacing: 1.4,
    lineHeight: 12,
  },
  planDetailUnselected: { color: C.textMuted },
  planDetailSelected:   { color: 'rgba(26,26,26,0.65)' },

  planRight: { alignItems: 'flex-end', gap: 0 },
  planPrice: {
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  planPriceUnselected: { color: C.textPrimary },
  planPriceSelected:   { color: C.ink },
  planPriceUnit: {
    fontFamily: Fonts.label,
    fontSize: 9,
    letterSpacing: 1.4,
    lineHeight: 12,
  },

  // BEST VALUE badge (inline next to the Annual label)
  badgeInline: {
    backgroundColor: C.vermillion,
    borderRadius: R.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontFamily: Fonts.label,
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 1.3,
  },

  // CTA
  cta: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SP.xs,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.ink,
    letterSpacing: 0.8,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLandscape: {
    gap: 6,
    alignItems: 'flex-start',
  },
  footerLink: {
    fontFamily: Fonts.label,
    fontSize: 10,
    color: C.textSub,
    letterSpacing: 1.4,
    textDecorationLine: 'underline',
  },
  footerInfo: {
    fontFamily: Fonts.label,
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 1.4,
  },
});
