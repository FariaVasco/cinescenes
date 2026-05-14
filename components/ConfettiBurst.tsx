import { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

const CONFETTI_COLORS = [
  '#F5C518', '#F5C518', '#F5C518', '#F5C518',
  '#E8372A', '#E8372A',
  '#54B0D9', '#54B0D9',
  '#ffffff', '#ffffff',
  '#1A1A1A',
];
const PER_CANNON = 45;

export function ConfettiBurst({ trigger = true }: { trigger?: boolean }) {
  const [fired, setFired] = useState(false);
  const makeParticle = (i: number) => {
    const fromRight = i >= PER_CANNON;
    const frac = (i % PER_CANNON) / (PER_CANNON - 1);
    const spreadRad = (80 / 180) * Math.PI;
    const baseAngle = fromRight ? (-155 / 180) * Math.PI : (-105 / 180) * Math.PI;
    const angle = baseAngle + frac * spreadRad + (Math.random() - 0.5) * 0.25;
    const speed   = 300 + Math.random() * 350;
    const gravity = 550 + Math.random() * 280;
    const isStrip = Math.random() < 0.70;
    return {
      anim: new Animated.Value(0),
      fromRight,
      dx:     Math.cos(angle) * speed,
      dyPeak: Math.sin(angle) * speed,
      dyEnd:  Math.sin(angle) * speed + gravity,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: isStrip ? 3.5 + Math.random() * 3 : 6 + Math.random() * 6,
      h: isStrip ? 14  + Math.random() * 12 : 6 + Math.random() * 6,
      spins:    (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 6),
      delay:    Math.floor(Math.random() * 320),
      duration: 1600 + Math.floor(Math.random() * 600),
    };
  };

  const particles = useRef(
    Array.from({ length: PER_CANNON * 2 }, (_, i) => makeParticle(i))
  ).current;

  useEffect(() => {
    if (!trigger) return;
    setFired(true);
    particles.forEach(p => {
      p.anim.setValue(0);
      Animated.timing(p.anim, {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    });
  }, [trigger]);

  if (!fired) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const ty = p.anim.interpolate({
          inputRange: [0, 0.38, 1],
          outputRange: [0, p.dyPeak, p.dyEnd],
        });
        const opacity = p.anim.interpolate({
          inputRange: [0, 0.70, 1],
          outputRange: [1, 1, 0],
        });
        const rotate = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.spins * 360}deg`],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              bottom: '5%',
              left: p.fromRight ? '85%' : '15%',
              width: p.w,
              height: p.h,
              borderRadius: 1,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX: tx }, { translateY: ty }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
