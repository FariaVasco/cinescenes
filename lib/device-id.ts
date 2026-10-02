import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cinescenes.deviceId';

let cached: string | null = null;

// Anonymous per-install id for analytics (e.g. counting distinct people who
// tapped USE DECK). Random, not tied to the account or hardware; resets on
// reinstall. Math.random is fine here — this only needs to be unique-ish.
function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getDeviceId(): Promise<string | null> {
  if (cached) return cached;
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = randomUuid();
      await AsyncStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    return null;
  }
}
