import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ChallengeTimerProps {
  seconds: number;
  onExpire: () => void;
  /** Content rendered inside the ring (e.g. a Challenge button) */
  children?: React.ReactNode;
  /** Outer diameter of the ring. Defaults to 108. */
  size?: number;
}

const STROKE = 5;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ChallengeTimer({ seconds, onExpire, children, size = 108 }: ChallengeTimerProps) {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: seconds * 1000,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onExpire();
    });
  }, []);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circumference],
  });

  const strokeColor = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: ['#e63946', '#f5a623', '#555'],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* SVG ring sits behind children */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#2a2a3a" strokeWidth={STROKE} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={strokeColor as any}
          strokeWidth={STROKE} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
