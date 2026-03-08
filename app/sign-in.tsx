import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { C, R, FS } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { CinescenesLogo } from '@/components/CinescenesLogo';

export default function SignInScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleApple() {
    setLoading(true);
    try {
      await signInWithApple();
      router.replace((returnTo as any) ?? '/');
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', e?.message ?? 'Could not sign in with Apple');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace((returnTo as any) ?? '/');
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Could not sign in with Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <CinescenesLogo size="sm" />
        <Text style={styles.headline}>Sign in to unlock Premium</Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.appleBtn}
            onPress={handleApple}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.appleBtnText}>Continue with Apple</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogle}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Only needed to host premium games</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  backBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: FS.base },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40, gap: 28,
  },
  headline: {
    color: C.textPrimary, fontSize: FS.xl, fontWeight: '800',
    textAlign: 'center', letterSpacing: 0.2,
  },
  buttons: { width: '100%', gap: 12 },
  appleBtn: {
    backgroundColor: '#000', borderRadius: R.btn,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  appleBtnText: { color: '#fff', fontSize: FS.md, fontWeight: '700', letterSpacing: 0.3 },
  googleBtn: {
    backgroundColor: '#fff', borderRadius: R.btn,
    paddingVertical: 16, alignItems: 'center',
  },
  googleBtnText: { color: '#111', fontSize: FS.md, fontWeight: '700', letterSpacing: 0.3 },
  hint: { color: C.textMuted, fontSize: FS.sm, textAlign: 'center' },
});
