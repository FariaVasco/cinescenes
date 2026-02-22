import { MD3DarkTheme } from 'react-native-paper';

export const cinemaTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    // Brand
    primary: '#f5c518',
    onPrimary: '#0a0a0a',
    primaryContainer: '#3a2e00',
    onPrimaryContainer: '#f5c518',
    // Surfaces
    background: '#100a20',
    surface: '#1a1a2e',
    surfaceVariant: '#1e1630',
    surfaceContainerHigh: '#1e1630',
    surfaceContainerHighest: '#252040',
    onSurface: '#ffffff',
    onSurfaceVariant: '#aaaaaa',
    // Outline
    outline: 'rgba(255,255,255,0.15)',
    outlineVariant: 'rgba(255,255,255,0.08)',
    // Error
    error: '#cf6679',
    onError: '#fff',
    // Inverse
    inverseSurface: '#f0e6ff',
    inverseOnSurface: '#100a20',
    inversePrimary: '#7a5f00',
  },
};
