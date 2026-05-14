import { useEffect, useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { PlayIcon } from '@/components/CinemaIcons';

export function FadePauseOverlay({ visible, onPress, style }: { visible: boolean; onPress: () => void; style: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);
  return (
    <Animated.View style={[style, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onPress}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <PlayIcon size={72} color='rgba(255,255,255,0.9)' />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
