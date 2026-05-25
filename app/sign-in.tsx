import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { C, T, SP, Fonts, FS } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { CinescenesLogo } from '@/components/CinescenesLogo';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';

const lcCoin        = require('@/assets/lc-coin.png');
const lcStarburst   = require('@/assets/lc-starburst.png');
const lcTrophy      = require('@/assets/lc-trophy.png');
const lcMysteryCard = require('@/assets/lc-mystery-card.png');

export default function SignInScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

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

  const actions = (
    <View style={styles.actions}>
      <CinemaButton
        size="lg"
        onPress={Platform.OS === 'ios' ? handleApple : handleGoogle}
        disabled={loading}
        style={styles.fullWidth}
      >
        {loading
          ? '…'
          : Platform.OS === 'ios'
          ? 'CONTINUE WITH APPLE'
          : 'CONTINUE WITH GOOGLE'}
      </CinemaButton>
      <Text style={styles.hint}>Only needed to host premium games</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Corner decorations */}
      <Image source={lcStarburst}   style={[styles.deco, { width: 64, height: 64, top: 12,  left: 12,  opacity: 0.12, transform: [{ rotate: '-15deg' }] }]} />
      <Image source={lcCoin}        style={[styles.deco, { width: 72, height: 72, top: 8,   right: 12, opacity: 0.12, transform: [{ rotate: '10deg'  }] }]} />
      <Image source={lcMysteryCard} style={[styles.deco, { width: 64, height: 64, bottom: 12, left: 12, opacity: 0.12, transform: [{ rotate: '-6deg'  }] }]} />
      <Image source={lcTrophy}      style={[styles.deco, { width: 52, height: 52, bottom: 16, right: 16, opacity: 0.12, transform: [{ rotate: '18deg'  }] }]} />

      <BackButton onPress={() => router.back()} />

      {landscape ? (
        <View style={styles.row}>
          <View style={styles.brand}>
            <CinescenesLogo layout="vertical" iconSize={48} />
            <View style={styles.textGroup}>
              <Text style={styles.overline}>SIGN IN TO CONTINUE</Text>
              <Text style={styles.title}>Unlock Premium</Text>
              <Text style={styles.body}>Host themed movie collections{'\n'}and future game modes</Text>
            </View>
          </View>
          <View style={styles.divider} />
          {actions}
        </View>
      ) : (
        <View style={styles.content}>
          <CinescenesLogo layout="vertical" iconSize={56} />
          <View style={styles.textGroup}>
            <Text style={styles.overline}>SIGN IN TO CONTINUE</Text>
            <Text style={styles.title}>Unlock Premium</Text>
            <Text style={styles.body}>Host themed movie collections{'\n'}and future game modes</Text>
          </View>
          {actions}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  deco: {
    position: 'absolute',
    resizeMode: 'contain',
  },
  // Portrait
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SP.xl + 8,
    gap: SP.xl,
  },
  // Landscape
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.xl,
    gap: SP.xl,
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    gap: SP.lg,
  },
  divider: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(26,26,26,0.12)',
  },
  actions: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP.md,
  },
  textGroup: {
    alignItems: 'center',
    gap: SP.sm,
  },
  overline: {
    ...T.overline,
  },
  title: {
    ...T.display,
    color: C.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...T.body,
    textAlign: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  hint: {
    ...T.caption,
    textAlign: 'center',
  },
});
