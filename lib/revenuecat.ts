import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import * as Sentry from '@sentry/react-native';

const RC_KEY = Platform.OS === 'ios'
  ? (process.env.EXPO_PUBLIC_REVENUECAT_KEY_IOS ?? '')
  : (process.env.EXPO_PUBLIC_REVENUECAT_KEY_ANDROID ?? '');

// Must match the entitlement identifier set in the RevenueCat dashboard
export const ENTITLEMENT_ID = 'Cinescenes Pro';

// ── TEMP diagnostics for the premium-activation bug — remove once solved ──
// In-memory event log surfaced by app/rc-debug.tsx (Settings → 5 taps on the
// TMDB logo). Records every identity/entitlement-relevant step with timing.
const rcLog: string[] = [];
export function logRc(msg: string) {
  rcLog.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
  if (rcLog.length > 80) rcLog.shift();
}
export function getRcLog(): string[] {
  return [...rcLog];
}

export function initRevenueCat() {
  if (!RC_KEY) {
    logRc('initRevenueCat: NO API KEY — RevenueCat disabled');
    return;
  }
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_KEY });
  logRc(`configure() called, key=${RC_KEY.slice(0, 8)}…`);
  Purchases.getCustomerInfo()
    .then((info) => logRc(`initial getCustomerInfo: user=${info.originalAppUserId}, active=${JSON.stringify(Object.keys(info.entitlements.active))}`))
    .catch((e) => { logRc(`initial getCustomerInfo FAILED: ${e?.message}`); Sentry.captureException(e); });
}

export async function identifyUser(supabaseUserId: string) {
  logRc(`logIn(${supabaseUserId.slice(0, 8)}…) starting`);
  try {
    const { customerInfo, created } = await Purchases.logIn(supabaseUserId);
    logRc(`logIn OK, created=${created}, active=${JSON.stringify(Object.keys(customerInfo.entitlements.active))}`);
  } catch (e: any) {
    logRc(`logIn FAILED: ${e?.message}`);
    throw e;
  }
}

export async function checkPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    const activeKeys = Object.keys(info.entitlements.active);
    logRc(`checkPremium: user=${info.originalAppUserId}, active=${JSON.stringify(activeKeys)}`);
    // The project has a single entitlement, so any active one means premium.
    // Matching by exact ID is fragile: an invisible identifier mismatch versus
    // the dashboard silently locks out every paying user.
    if (activeKeys.length > 0 && info.entitlements.active[ENTITLEMENT_ID] === undefined) {
      Sentry.captureMessage(
        `Entitlement ID mismatch: expected "${ENTITLEMENT_ID}", active: ${JSON.stringify(activeKeys)}`,
        'warning'
      );
    }
    return activeKeys.length > 0;
  } catch (e: any) {
    logRc(`checkPremium FAILED: ${e?.message}`);
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
