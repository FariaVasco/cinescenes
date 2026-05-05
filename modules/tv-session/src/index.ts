import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const native = Platform.OS === 'ios' ? requireOptionalNativeModule('TVSession') : null;

export const TVSession = {
  setGameId(gameId: string) {
    native?.setGameId(gameId);
  },
  getGameId(): string | null {
    return native?.getGameId() ?? null;
  },
};
