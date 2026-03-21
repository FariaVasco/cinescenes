import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

const RC_KEY = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? '';

// Must match the entitlement identifier set in the RevenueCat dashboard
export const ENTITLEMENT_ID = 'Cinescenes Pro';

export function initRevenueCat() {
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_KEY });
  Purchases.getCustomerInfo().then(info =>
    console.log('[RC] customer ID:', info.originalAppUserId)
  ).catch(() => {});
}

export async function identifyUser(supabaseUserId: string) {
  await Purchases.logIn(supabaseUserId);
}

export async function checkPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    console.log('[RC] customer ID:', info.originalAppUserId);
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Presents RevenueCat's native paywall UI.
 * Returns true if the user purchased or restored successfully.
 */
export async function presentPaywall(): Promise<boolean> {
  try {
    const result = await RevenueCatUI.presentPaywall();
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch {
    return false;
  }
}

/**
 * Presents the RevenueCat Customer Center (manage subscription, refunds, etc).
 */
export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}
