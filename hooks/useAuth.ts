import { supabase } from '@/lib/supabase';
import { identifyUser, checkPremium } from '@/lib/revenuecat';
import { useAppStore } from '@/store/useAppStore';

const db = supabase as unknown as { from: (t: string) => any };

async function syncProfile(userId: string) {
  const { setIsPremium } = useAppStore.getState();
  const { data: profile } = await db
    .from('profiles')
    .select('is_premium')
    .eq('id', userId)
    .single();
  const dbPremium = profile?.is_premium ?? false;
  const rcPremium = await checkPremium();
  setIsPremium(dbPremium || rcPremium);
  await identifyUser(userId);
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

  async function restoreSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    useAppStore.getState().setAuthUser(session.user);
    await syncProfile(session.user.id);
  }

  return { signInWithApple, signInWithGoogle, signOut, restoreSession };
}
