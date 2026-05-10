import { requireNativeViewManager, EventEmitter, requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ViewProps } from 'react-native';

const NativeAirPlayPickerView = Platform.OS === 'ios'
  ? requireNativeViewManager('AirPlayPicker')
  : null;

const nativeModule = Platform.OS === 'ios'
  ? requireOptionalNativeModule('AirPlayPicker')
  : null;

const emitter = nativeModule ? new EventEmitter(nativeModule) : null;

interface AirPlayButtonProps extends ViewProps {
  tintColor?: string;
  activeTintColor?: string;
}

export function AirPlayButton(props: AirPlayButtonProps) {
  if (!NativeAirPlayPickerView) return null;
  return <NativeAirPlayPickerView {...props} />;
}

export function useAirPlayAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!nativeModule || !emitter) return;
    setAvailable(nativeModule.isMultipleRoutesAvailable());
    // AVRouteDetector needs ~1s to finish scanning after being enabled —
    // re-check so devices already present at mount time aren't missed.
    const timer = setTimeout(() => setAvailable(nativeModule.isMultipleRoutesAvailable()), 1500);
    const sub = emitter.addListener('onRoutesAvailableChanged', (event: { available: boolean }) => {
      setAvailable(event.available);
    });
    return () => { sub.remove(); clearTimeout(timer); };
  }, []);

  return available;
}
