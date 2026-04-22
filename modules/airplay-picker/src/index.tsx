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
    if (!emitter) return;
    const sub = emitter.addListener('onRoutesAvailableChanged', (event: { available: boolean }) => {
      setAvailable(event.available);
    });
    return () => sub.remove();
  }, []);

  return available;
}
