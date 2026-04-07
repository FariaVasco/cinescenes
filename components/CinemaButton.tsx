/**
 * CinemaButton — Ligne Claire button component.
 *
 * Variants:
 *   'primary'   — ochre fill, ink text, ink stroke     (main CTAs)
 *   'secondary' — vermillion fill, white text, ink stroke
 *   'ghost'     — transparent, ink stroke, ink text
 *   'danger'    — alias for 'secondary' (kept for compatibility)
 *
 * Sizes: 'sm' | 'md' | 'lg'
 */

import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import { C, R, FS, Fonts } from '@/constants/theme';

interface CinemaButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
    Animated.timing(scale, { toValue: 0.97, useNativeDriver: true, duration: 80 }).start();
  };
  const onPressOut = () => {
    Animated.timing(scale, { toValue: 1, useNativeDriver: true, duration: 120 }).start();
  };

  const resolvedVariant = variant === 'danger' ? 'secondary' : variant;

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
          variantStyle[resolvedVariant],
          disabled && s.disabled,
        ]}
        {...rest}
      >
        <Text style={[s.label, sizeLabel[size], variantLabel[resolvedVariant]]}>
          {children}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.ink,
  },
  disabled: {
    opacity: 0.35,
  },
  label: {
    fontFamily: Fonts.display,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

const sizeStyle = StyleSheet.create({
  sm: { paddingHorizontal: 16, paddingVertical:  8, borderRadius: R.md  },
  md: { paddingHorizontal: 18, paddingVertical:  8, borderRadius: R.btn },
  lg: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: R.btn },
});

const sizeLabel = StyleSheet.create({
  sm: { fontSize: FS.base },
  md: { fontSize: FS.md   },
  lg: { fontSize: FS.xl   },
});

const variantStyle = StyleSheet.create({
  primary:   { backgroundColor: C.ochre },
  secondary: { backgroundColor: C.vermillion },
  ghost:     { backgroundColor: 'transparent' },
});

const variantLabel = StyleSheet.create({
  primary:   { color: C.textOnOchre },
  secondary: { color: C.textOnRed },
  ghost:     { color: C.textPrimary },
});
