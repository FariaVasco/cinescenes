import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Animated, StyleSheet, Easing } from 'react-native';
import { C, FS, Fonts } from '@/constants/theme';

const lcClapperboard = require('../assets/lc-clapperboard.png');

export function ChoosingMovieLabel() {
  const [dots, setDots] = useState('');
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <Animated.Text style={{ fontFamily: Fonts.display, fontSize: FS.xl, color: C.textPrimary, letterSpacing: 0.4, opacity: fadeIn }}>
      Choosing a movie{dots}
    </Animated.Text>
  );
}

export function BrandedLoader() {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const pulse  = useRef(new Animated.Value(1)).current;
  const [dots, setDots] = useState('');
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => { loop.stop(); clearInterval(t); };
  }, []);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 18, opacity: fadeIn }]}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Image source={lcClapperboard} style={{ width: 96, height: 96, resizeMode: 'contain' }} />
      </Animated.View>
      <Text style={{ fontFamily: Fonts.display, fontSize: FS.xl, color: C.textPrimary, letterSpacing: 0.4 }}>
        Shuffling the deck{dots}
      </Text>
      <Text style={{ fontFamily: Fonts.body, fontSize: FS.base, color: C.textSub }}>
        Dealing starting cards
      </Text>
    </Animated.View>
  );
}
