import { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, T, SP } from '@/constants/theme';
import { PaywallSheet, Plan } from '@/components/PaywallSheet';

const MOCK_PLANS: Plan[] = [
  { pkg: null, label: 'Monthly',  price: '€3.59',  detail: '' },
  { pkg: null, label: 'Annual',   price: '€29.99', detail: 'Save 30%',                badge: 'BEST VALUE' },
  { pkg: null, label: 'Lifetime', price: '€59.99', detail: 'Pay once. Yours forever.', badge: 'FOREVER' },
];

// Dev-only route for iterating on paywall design without going through auth + Play.
// Navigate to /debug-paywall in the app (works in Expo dev client / simulator / device).
export default function DebugPaywallScreen() {
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(true);

  // Lock to landscape — without this, the Modal in PaywallSheet crashes when
  // presenting (UIViewController __supportedInterfaceOrientations conflict).
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Paywall Preview</Text>
        <Text style={styles.body}>Dev-only screen. Bypasses auth + RevenueCat to let you iterate on the paywall UI directly.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => setPaywallOpen(true)}>
          <Text style={styles.btnText}>Re-open paywall</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => router.back()}>
          <Text style={[styles.btnText, styles.btnTextGhost]}>Back</Text>
        </TouchableOpacity>
      </View>
      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchased={() => setPaywallOpen(false)}
        mockPlans={MOCK_PLANS}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SP.xl, gap: SP.md },
  title: { ...T.display, color: C.textPrimary, textAlign: 'center' },
  body: { ...T.body, textAlign: 'center', marginBottom: SP.md },
  btn: { paddingHorizontal: SP.lg, paddingVertical: SP.md, borderRadius: 12, backgroundColor: C.ochre },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 2, borderColor: C.ink },
  btnText: { ...T.label, color: C.textOnOchre },
  btnTextGhost: { color: C.textPrimary },
});
