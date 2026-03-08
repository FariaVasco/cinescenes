import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const RC_KEY = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? '';

export function initRevenueCat() {
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_KEY });
}

export async function identifyUser(supabaseUserId: string) {
  await Purchases.logIn(supabaseUserId);
}

export async function checkPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active['premium'] !== undefined;
  } catch {
    return false;
  }
}

export async function getOfferings() {
  return Purchases.getOfferings();
}
