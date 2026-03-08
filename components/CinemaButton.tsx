/**
 * CinemaButton — unified button component for Cinescenes.
 * Translated from the Figma Make design (web → React Native).
 *
 * Variants: 'primary' (gold fill) | 'ghost' (bordered) | 'danger' (red fill)
 * Sizes:    'sm' | 'md' | 'lg'
 */

import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';
import { C, R, FS } from '@/constants/theme';

interface CinemaButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function CinemaButton({
  variant = 'primary',
  size = 'md',
  disabled,
  onPress,
  style,
  children,
  ...rest
}: CinemaButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        activeOpacity={1}
        style={[
          s.base,
          sizeStyle[size],
          variantStyle[variant],
          disabled && s.disabled,
        ]}
        {...rest}
      >
        <Text style={[s.label, sizeLabel[size], variantLabel[variant], disabled && s.labelDisabled]}>
          {children}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontWeight: '600',
    textAlign: 'center',
  },
  labelDisabled: {},
});

const sizeStyle = StyleSheet.create({
  sm: { paddingHorizontal: 16, paddingVertical:  8, borderRadius: R.sm  },
  md: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: R.btn },
  lg: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: R.btn },
});

const sizeLabel = StyleSheet.create({
  sm: { fontSize: FS.base },
  md: { fontSize: FS.base },
  lg: { fontSize: FS.lg   },
});

const variantStyle = StyleSheet.create({
  primary: {
    backgroundColor: C.gold,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: C.border,
  },
  danger: {
    backgroundColor: C.danger,
  },
});

const variantLabel = StyleSheet.create({
  primary: { color: C.textOnGold },
  ghost:   { color: C.textPrimary },
  danger:  { color: '#ffffff' },
});
