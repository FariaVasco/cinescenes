import { supabase } from '@/lib/supabase';
import { identifyUser, checkPremium } from '@/lib/revenuecat';
import { useAppStore } from '@/store/useAppStore';

async function syncProfile(userId: string) {
  const { setIsPremium } = useAppStore.getState();
  await identifyUser(userId);
  const rcPremium = await checkPremium();
  setIsPremium(rcPremium);
}

export function useAuth() {
  const { setAuthUser, setIsPremium } = useAppStore();

  async function signInWithApple() {
    const AppleAuthentication = require('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken!,
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error('No user returned');
    setAuthUser(user);
    await syncProfile(user.id);
  }

  async function signInWithGoogle() {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken!,
    });
    if (error) throw error;
    const user = data.user;
    if (!user) throw new Error('No user returned');
    setAuthUser(user);
    await syncProfile(user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthUser(null);
    setIsPremium(false);
  }

  async function deleteAccount() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      }
    );
    if (!res.ok) throw new Error('Account deletion failed');
    await supabase.auth.signOut();
    setAuthUser(null);
    setIsPremium(false);
  }

  async function restoreSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      useAppStore.getState().setAuthUser(session.user);
      await syncProfile(session.user.id);
    } catch (_) {
      // Network unavailable on startup — app works fine without a restored session
    }
  }

  return { signInWithApple, signInWithGoogle, signOut, deleteAccount, restoreSession };
}
