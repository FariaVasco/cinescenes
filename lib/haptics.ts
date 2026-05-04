import { useAppStore } from '@/store/useAppStore';

// Lazy-loaded so a missing native module (e.g., dev build pre-dating expo-haptics
// install) can't crash the JS bundle. The module is required on first use; if the
// require itself throws, we mark it unavailable and never try again.

type HapticsApi = {
  impactAsync: (style: any) => Promise<unknown>;
  selectionAsync: () => Promise<unknown>;
  notificationAsync: (type: any) => Promise<unknown>;
  ImpactFeedbackStyle: { Light: any; Medium: any; Heavy: any };
  NotificationFeedbackType: { Success: any; Warning: any; Error: any };
};

let H: HapticsApi | null | undefined; // undefined = not tried, null = unavailable

function load(): HapticsApi | null {
  if (H !== undefined) return H;
  try {
    H = require('expo-haptics') as HapticsApi;
    if (!H?.impactAsync) {
      console.warn('[haptics] expo-haptics loaded but API missing — disabling');
      H = null;
    }
  } catch (e) {
    console.warn('[haptics] failed to load expo-haptics, disabling:', e);
    H = null;
  }
  return H;
}

function enabled() {
  try { return useAppStore.getState().settings.vibration; } catch { return false; }
}

function safe(fn: (h: HapticsApi) => Promise<unknown> | void) {
  if (!enabled()) return;
  const h = load();
  if (!h) return;
  try {
    const r = fn(h);
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {}
}

export const tap     = () => safe((h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
export const select  = () => safe((h) => h.selectionAsync());
export const impact  = () => safe((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium));
export const heavy   = () => safe((h) => h.impactAsync(h.ImpactFeedbackStyle.Heavy));
export const success = () => safe((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
export const warning = () => safe((h) => h.notificationAsync(h.NotificationFeedbackType.Warning));
export const error   = () => safe((h) => h.notificationAsync(h.NotificationFeedbackType.Error));
