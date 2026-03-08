/**
 * Safe wrapper around expo-speech-recognition.
 *
 * Uses requireOptionalNativeModule (never throws, returns null if unavailable)
 * instead of a try/catch around require(), which is unreliable with Metro bundling.
 *
 * useSpeechRecognitionEvent is a stable function reference determined at module
 * load time, satisfying React's rules-of-hooks requirement.
 */

import { requireOptionalNativeModule, useEventListener } from 'expo';

type SpeechEventListener = (event: any) => void;

const _module = requireOptionalNativeModule<any>('ExpoSpeechRecognition');

export const speechAvailable: boolean = _module !== null;

export const SpeechModule = {
  requestPermissionsAsync: async (): Promise<{ granted: boolean }> => {
    if (!_module) return { granted: false };
    return _module.requestPermissionsAsync();
  },
  start: (options: { lang?: string; continuous?: boolean; interimResults?: boolean; androidIntentOptions?: Record<string, number> }) => {
    if (_module) _module.start(options);
  },
  stop: () => {
    if (_module) _module.stop();
  },
};

// Stable function reference decided once at module load time.
// When available: wraps useEventListener. When not: stable no-op.
// Either way the same ref is used on every render — rules-of-hooks compliant.
export const useSpeechRecognitionEvent: (name: string, listener: SpeechEventListener) => void =
  _module
    ? (name: string, listener: SpeechEventListener) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        (useEventListener as any)(_module, name, listener);
      }
    : () => {};
