// ── TEMP diagnostics screen for the premium-activation bug — remove once solved ──
// Reached via Settings → About → tap the TMDB logo 5 times.
// Shows the device's live RevenueCat identity, entitlements, offering resolution,
// Supabase auth state, and the in-memory RC event log. "Share" exports everything.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Share, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Purchases from 'react-native-purchases';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Fonts, FS, R, SP } from '@/constants/theme';
import { ENTITLEMENT_ID, getRcLog } from '@/lib/revenuecat';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

async function collect(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    collectedAt: new Date().toISOString(),
    appVersion: Application.nativeApplicationVersion,
    buildVersion: Application.nativeBuildVersion,
    updateId: Updates.updateId ?? 'embedded',
    expectedEntitlementId: ENTITLEMENT_ID,
    expectedEntitlementIdLength: ENTITLEMENT_ID.length,
  };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    out.supabase = session?.user
      ? { userId: session.user.id, email: session.user.email }
      : 'NO SESSION';
  } catch (e: any) {
    out.supabase = `ERROR: ${e?.message}`;
  }
  out.storeIsPremium = useAppStore.getState().isPremium;
  out.storeAuthUser = useAppStore.getState().authUser?.id ?? null;
  try {
    out.rcAppUserID = await Purchases.getAppUserID();
    out.rcIsAnonymous = await Purchases.isAnonymous();
  } catch (e: any) {
    out.rcAppUserID = `ERROR: ${e?.message}`;
  }
  try {
    await Purchases.invalidateCustomerInfoCache().catch(() => {});
    const info = await Purchases.getCustomerInfo();
    out.rcOriginalAppUserId = info.originalAppUserId;
    out.rcFirstSeen = info.firstSeen;
    out.rcRequestDate = info.requestDate;
    out.rcActiveSubscriptions = info.activeSubscriptions;
    out.rcAllPurchasedProducts = info.allPurchasedProductIdentifiers;
    out.rcActiveEntitlements = Object.fromEntries(
      Object.entries(info.entitlements.active).map(([k, e]) => [
        `${JSON.stringify(k)} (len ${k.length})`,
        {
          product: e.productIdentifier,
          expires: e.expirationDate,
          sandbox: e.isSandbox,
          willRenew: e.willRenew,
          store: e.store,
        },
      ])
    );
    out.rcAllEntitlementKeys = Object.keys(info.entitlements.all).map(
      (k) => `${JSON.stringify(k)} (len ${k.length})`
    );
  } catch (e: any) {
    out.rcCustomerInfo = `ERROR: ${e?.message}`;
  }
  try {
    const offerings = await Purchases.getOfferings();
    out.rcCurrentOffering = offerings.current
      ? {
          id: offerings.current.identifier,
          packages: offerings.current.availablePackages.map((p) => ({
            pkg: p.identifier,
            product: p.product.identifier,
            price: p.product.priceString,
          })),
        }
      : 'NO CURRENT OFFERING';
  } catch (e: any) {
    out.rcCurrentOffering = `ERROR: ${e?.message}`;
  }
  out.eventLog = getRcLog();
  return out;
}

export default function RcDebugScreen() {
  const router = useRouter();
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreResult, setRestoreResult] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    try { setDiag(await collect()); } finally { setBusy(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function doRestore() {
    setBusy(true);
    try {
      const info = await Purchases.restorePurchases();
      setRestoreResult(`restore OK — active: ${JSON.stringify(Object.keys(info.entitlements.active))}`);
    } catch (e: any) {
      setRestoreResult(`restore FAILED: ${e?.message}`);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const text = (diag ? JSON.stringify(diag, null, 2) : 'Collecting…')
    + (restoreResult ? `\n\n${restoreResult}` : '');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>RC DIAGNOSTICS</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btn} disabled={busy} onPress={refresh}>
            <Text style={styles.btnText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} disabled={busy} onPress={doRestore}>
            <Text style={styles.btnText}>Restore</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => Share.share({ message: text })}>
            <Text style={styles.btnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView style={styles.scroll}>
        <Text selectable style={styles.mono}>{text}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.md,
    paddingVertical: 6,
  },
  title: { fontFamily: Fonts.display, fontSize: FS.lg, color: C.ochre, letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: C.surfaceWarm,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnText: { fontFamily: Fonts.label, fontSize: FS.sm, color: C.textPrimary },
  scroll: { flex: 1, paddingHorizontal: SP.md },
  mono: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: C.textPrimary,
    paddingBottom: 24,
  },
});
