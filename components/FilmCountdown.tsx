import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';
import { useAudioPlayer } from 'expo-audio';
import { Fonts } from '@/constants/theme';

// ── Colour palette ────────────────────────────────────────────────────────────
const BG_COLORS = [
  '#2D2418', // parchment-dark
  '#E9B430', // ochre
  '#C93420', // vermillion
  '#2B7DB8', // cerulean
  '#1A140B', // parchment-darker
];

const STRIP_W = 58;

// ── Sprocket strip ─────────────────────────────────────────────────────────────
function SprocketStrip({ side }: { side: 'left' | 'right' }) {
  return (
    <View
      style={[
        styles.strip,
        side === 'left' ? styles.stripLeft : styles.stripRight,
      ]}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface FilmCountdownProps {
  from?: number;
  onComplete?: () => void;
}

export default function FilmCountdown({ from = 5, onComplete }: FilmCountdownProps) {
  const { width: sw, height: sh } = useWindowDimensions();
  const [n, setN]             = useState(from);
  const [sweepDeg, setSweepDeg] = useState(0); // SVG sweep hand angle (0–360)

  const popAnim  = useRef(new Animated.Value(0)).current; // numeral pop scale
  const fadeAnim = useRef(new Animated.Value(0)).current; // bg crossfade opacity

  const tickPlayer = useAudioPlayer(require('../assets/sounds/countdown-tick.wav'));

  // Disc sizing: square, filling the center column height
  const discSize = Math.min(sh * 0.88, sw - STRIP_W * 2 - 16);
  const numeralSize = Math.round(discSize * 0.44);
  const goSize      = Math.round(discSize * 0.38);

  // ── Countdown timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (n <= 0) {
      const t = setTimeout(() => onComplete?.(), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [n, onComplete]);

  // ── Sweep hand via requestAnimationFrame (most reliable for SVG) ─────────────
  useEffect(() => {
    if (n <= 0) return; // no disc on GO! frame
    const startTime = Date.now();
    let rafId: number;
    const frame = () => {
      const elapsed = (Date.now() - startTime) % 1000;
      setSweepDeg((elapsed / 1000) * 360);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [n]);

  // ── Per-tick animations (pop + bg fade + sound) ──────────────────────────────
  useEffect(() => {
    try { tickPlayer.seekTo(0); tickPlayer.play(); } catch { /* silent */ }

    popAnim.setValue(0);
    Animated.timing(popAnim, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();

    if (n > 0) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 980,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    }
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sweep hand endpoint (equivalent to CSS rotate on a 12-o'clock line) ──────
  const sweepRad = ((sweepDeg - 90) * Math.PI) / 180;
  const hx = 100 + Math.cos(sweepRad) * 84;
  const hy = 100 + Math.sin(sweepRad) * 84;
  const tx = 100 + Math.cos(sweepRad) * 82;
  const ty = 100 + Math.sin(sweepRad) * 82;

  // ── Background colours ────────────────────────────────────────────────────────
  const bgIdx  = (from - n) % BG_COLORS.length;
  const bgPrev = BG_COLORS[bgIdx];
  const bgNext = BG_COLORS[(bgIdx + 1) % BG_COLORS.length];

  // ── Numeral scale interpolation ───────────────────────────────────────────────
  const numeralScale = popAnim.interpolate({
    inputRange:  [0, 0.3, 1],
    outputRange: [0.6, 1.08, 1],
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: bgPrev }]}>

      {/* Background crossfade overlay */}
      {n > 0 && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: bgNext, opacity: fadeAnim }]}
        />
      )}

      {/* Left strip */}
      <SprocketStrip side="left" />

      {/* Centre: clock disc or GO! */}
      <View style={styles.center}>
        {n > 0 ? (
          <View style={{ width: discSize, height: discSize }}>

            <Svg viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
              {/* Disc */}
              <Circle cx="100" cy="100" r="92" fill="#1A140B" />

              {/* Sweep hand */}
              <G>
                <Line
                  x1="100" y1="100" x2={hx} y2={hy}
                  stroke="#E2A839" strokeWidth="3" strokeLinecap="round"
                />
                <Circle cx={tx} cy={ty} r="4" fill="#E2A839" stroke="#000" strokeWidth="1.5" />
              </G>

              {/* Rings */}
              <Circle cx="100" cy="100" r="92" fill="none" stroke="#000" strokeWidth="2.5" />
              <Circle cx="100" cy="100" r="80" fill="none" stroke="#000" strokeWidth="2.5" />
              <Circle cx="100" cy="100" r="40" fill="none" stroke="#000" strokeWidth="2.5" />

              {/* Crosshair */}
              <Line x1="0" y1="100" x2="200" y2="100" stroke="#000" strokeWidth="2.5" />
              <Line x1="100" y1="0" x2="100" y2="200" stroke="#000" strokeWidth="2.5" />

              {/* 12 tick marks */}
              {Array.from({ length: 12 }).map((_, i) => {
                const a  = (i * Math.PI) / 6 - Math.PI / 2;
                return (
                  <Line
                    key={i}
                    x1={100 + Math.cos(a) * 80} y1={100 + Math.sin(a) * 80}
                    x2={100 + Math.cos(a) * 92} y2={100 + Math.sin(a) * 92}
                    stroke="#000" strokeWidth="2.5" strokeLinecap="round"
                  />
                );
              })}

              {/* Centre dot */}
              <Circle cx="100" cy="100" r="4" fill="#000" />
            </Svg>

            {/* Numeral */}
            <Animated.View
              key={`num-${n}`}
              style={[styles.overlay, { transform: [{ scale: numeralScale }] }]}
            >
              <Text style={[styles.numeral, { fontSize: numeralSize }]}>{n}</Text>
            </Animated.View>

          </View>
        ) : (
          /* GO! */
          <Animated.View style={{ transform: [{ scale: numeralScale }] }}>
            <Text style={[styles.goText, { fontSize: goSize }]}>GO!</Text>
          </Animated.View>
        )}
      </View>

      {/* Right strip */}
      <SprocketStrip side="right" />

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },

  strip: {
    width: STRIP_W,       // fixed width — NOT flex, so it won't compete with the disc
    backgroundColor: '#0a0a0a',
    justifyContent: 'space-around',
    paddingVertical: 10,
    alignSelf: 'stretch', // fill parent height
  },
  stripLeft:  { borderRightWidth: 2, borderRightColor: '#000' },
  stripRight: { borderLeftWidth:  2, borderLeftColor:  '#000' },

  hole: {
    width: 26,
    height: 19,
    backgroundColor: '#2D2418',
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#000',
    alignSelf: 'center',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  numeral: {
    fontFamily: Fonts.display,
    color: '#E2A839',
    textShadowColor: '#000',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 1,
    lineHeight: undefined, // let React Native derive it from fontSize
  },

  goText: {
    fontFamily: Fonts.display,
    color: '#E2A839',
    textShadowColor: '#000',
    textShadowOffset: { width: 5, height: 5 },
    textShadowRadius: 1,
  },
});
