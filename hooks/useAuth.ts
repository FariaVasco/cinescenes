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

  function mockDevSignIn() {
    // Dev-only: skip real auth so paywall/etc. can be iterated on the simulator
    // where Apple/Google Sign-In don't work cleanly. Sets a fake user, skips
    // Supabase + RevenueCat sync.
    const fakeUser = {
      id: 'dev-user-00000000-0000-0000-0000-000000000000',
      email: 'dev@cinescenes.app',
      user_metadata: { full_name: 'Dev User', given_name: 'Dev' },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as any;
    setAuthUser(fakeUser);
  }

  async function signInWithApple() {
    if (__DEV__) {
      // Apple Sign-In can crash hard on iOS Simulator (capability/entitlement issues).
      // In dev we skip the native call entirely and just mock a user.
      // To test real Apple Sign-In, build a production-profile build.
      mockDevSignIn();
      return;
    }
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
    if (__DEV__) {
      // Google Sign-In requires Play Services + correct SHA-1 signing, which
      // dev clients can't reliably provide on simulators/emulators.
      // In dev we skip the native call and just mock a user.
      mockDevSignIn();
      return;
    }
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
