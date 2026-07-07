import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import * as Sentry from '@sentry/react-native';

const RC_KEY = Platform.OS === 'ios'
  ? (process.env.EXPO_PUBLIC_REVENUECAT_KEY_IOS ?? '')
  : (process.env.EXPO_PUBLIC_REVENUECAT_KEY_ANDROID ?? '');

// Must match the entitlement identifier set in the RevenueCat dashboard
export const ENTITLEMENT_ID = 'Cinescenes Pro';

export function initRevenueCat() {
  if (!RC_KEY) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_KEY });
  Purchases.getCustomerInfo().catch((e) => Sentry.captureException(e));
}

export async function identifyUser(supabaseUserId: string) {
  await Purchases.logIn(supabaseUserId);
}

export async function checkPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (e) {
    Sentry.captureException(e);
    return false;
  }
}

/**
 * checkPremium against a FRESH fetch — the SDK caches customer info for up to
 * ~5 minutes, which can miss a seconds-old purchase. Use right after purchase
 * or restore flows; plain checkPremium is fine everywhere else.
 */
export async function checkPremiumFresh(): Promise<boolean> {
  try {
    await Purchases.invalidateCustomerInfoCache();
  } catch (_) {
    // Cache invalidation is best-effort; fall through to the normal check.
  }
  return checkPremium();
}

/**
 * Presents RevenueCat's native paywall UI.
 * Returns true if the user purchased or restored successfully.
 */
export async function presentPaywall(): Promise<boolean> {
  try {
    const result = await RevenueCatUI.presentPaywall();
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (e) {
    Sentry.captureException(e);
    return false;
  }
}

/**
 * Presents the RevenueCat Customer Center (manage subscription, refunds, etc).
 */
export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}
