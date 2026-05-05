import { AppRegistry, Platform } from 'react-native';

// Register the TV spectator component before Expo Router initialises so it is
// always available when the native external-display scene fires, regardless of
// which screen the user is on or how fast they connect to AirPlay.
if (Platform.OS === 'ios') {
  const { TVScreenStandalone } = require('./app/tv');
  AppRegistry.registerComponent('tv', () => TVScreenStandalone);
}

import 'expo-router/entry';
