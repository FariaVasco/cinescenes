import { requireNativeViewManager } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { ViewProps } from 'react-native';

const NativeAirPlayPickerView = Platform.OS === 'ios'
  ? requireNativeViewManager('AirPlayPicker')
  : null;

interface AirPlayButtonProps extends ViewProps {
  tintColor?: string;
  activeTintColor?: string;
}

export function AirPlayButton(props: AirPlayButtonProps) {
  if (!NativeAirPlayPickerView) return null;
  return <NativeAirPlayPickerView {...props} />;
}
