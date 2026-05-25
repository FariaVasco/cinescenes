import { useEffect, useState } from 'react';
import { Platform, Linking } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '@/lib/supabase';

const STORE_URL = Platform.OS === 'android'
  ? 'market://details?id=com.cinescenes.app'
  : 'https://apps.apple.com/app/id6745914801';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useForceUpdate() {
  const [updateRequired, setUpdateRequired] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('app_config')
          .select('min_version_ios, min_version_android')
          .single();
        if (!data) return;
        const minVersion = Platform.OS === 'android'
          ? data.min_version_android
          : data.min_version_ios;
        const currentVersion = Application.nativeApplicationVersion ?? '0.0.0';
        if (compareVersions(currentVersion, minVersion) < 0) {
          setUpdateRequired(true);
        }
      } catch (_) {
        // Network failure — don't block the user
      }
    })();
  }, []);

  function openStore() {
    Linking.openURL(STORE_URL);
  }

  return { updateRequired, openStore };
}
