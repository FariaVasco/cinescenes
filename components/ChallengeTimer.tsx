import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C } from '@/constants/theme';

interface ChallengeTimerProps {
  seconds: number;
  onExpire: () => void;
  /** Content rendered inside the ring (ring mode only). */
  children?: React.ReactNode;
  /** Outer diameter of the ring. Defaults to 108. Ring mode only. */
  size?: number;
  /**
   * When true, renders a thin horizontal progress bar instead of a ring.
   * Children are ignored in bar mode — place buttons alongside separately.
   */
  barMode?: boolean;
}

const STROKE = 5;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ChallengeTimer({ seconds, onExpire, children, size = 108, barMode = false }: ChallengeTimerProps) {
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

  if (barMode) {
    const barColor = progress.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [C.vermillion, C.ochre, 'rgba(255,255,255,0.15)'],
    });
    const barWidth = progress.interpolate({
      inputRange: [0, 1],
      outputRange: ['100%', '0%'],
    });
    return (
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth as any, backgroundColor: barColor as any }]} />
      </View>
    );
  }

  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circumference],
  });
  const strokeColor = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [C.vermillion, C.ochre, 'rgba(255,255,255,0.15)'],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.10)" strokeWidth={STROKE} fill="none"
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

const styles = StyleSheet.create({
  barTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
