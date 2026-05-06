import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { useAudioPlayer } from 'expo-audio';
import { Fonts } from '@/constants/theme';

// ── Background colour cycle ──────────────────────────────────────────────────
const BG_COLORS = [
  '#2D2418', // parchment-dark
  '#E9B430', // ochre
  '#C93420', // vermillion
  '#2B7DB8', // cerulean
  '#1A140B', // parchment-darker
];

// ── Sweep hand using Animated SVG G ─────────────────────────────────────────
const AnimatedG = Animated.createAnimatedComponent(G);

// ── Film strip sprocket holes ────────────────────────────────────────────────
const STRIP_W    = 58;
const HOLE_COUNT = 9;

function SprocketStrip({ side }: { side: 'left' | 'right' }) {
  return (
    <View
      style={[
        styles.strip,
        side === 'left' ? styles.stripLeft : styles.stripRight,
      ]}
    >
      {Array.from({ length: HOLE_COUNT }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface FilmCountdownProps {
  from?: number;
  onComplete?: () => void;
}

export default function FilmCountdown({ from = 5, onComplete }: FilmCountdownProps) {
  const [n, setN] = useState(from);

  // Animated values
  const sweepAnim = useRef(new Animated.Value(0)).current; // 0–360 per tick (JS driver – SVG prop)
  const popAnim   = useRef(new Animated.Value(0)).current; // 0–1 per tick  (native driver – View scale)
  const fadeAnim  = useRef(new Animated.Value(0)).current; // 0–1 per tick  (native driver – View opacity)

  // Tick sound
  const tickPlayer = useAudioPlayer(
    require('../assets/sounds/countdown-tick.wav'),
  );

  // ── Disc sizing (landscape) ────────────────────────────────────────────────
  const { width: sw, height: sh } = Dimensions.get('window');
  // In landscape sw > sh. Disc must fit inside the center column height.
  const centerW  = sw - STRIP_W * 2;
  const discSize = Math.min(sh * 0.88, centerW - 16);

  const numeralSize = Math.round(discSize * 0.44);
  const goSize      = Math.round(discSize * 0.38);

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (n <= 0) {
      // "GO!" shown — fire onComplete after a short pause
      const t = setTimeout(() => onComplete?.(), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [n, onComplete]);

  // ── Animations triggered on each tick ────────────────────────────────────
  useEffect(() => {
    // Play tick sound (including on the "GO!" frame where n just became 0)
    try { tickPlayer.seekTo(0); tickPlayer.play(); } catch { /* silent if unavailable */ }

    // Sweep hand: 0 → 360° over 1 s
    sweepAnim.setValue(0);
    Animated.timing(sweepAnim, {
      toValue: 360,
      duration: 980,
      easing: Easing.linear,
      useNativeDriver: false, // SVG rotation prop — cannot use native driver
    }).start();

    // Numeral / GO! pop: 0 → 1 scale
    popAnim.setValue(0);
    Animated.timing(popAnim, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();

    // Background crossfade: overlay (next colour) fades from 0 → 1
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

  // ── Colour cycle ──────────────────────────────────────────────────────────
  const bgIdx  = (from - n) % BG_COLORS.length;
  const bgPrev = BG_COLORS[bgIdx];
  const bgNext = BG_COLORS[(bgIdx + 1) % BG_COLORS.length];

  // ── Numeral pop interpolation ──────────────────────────────────────────────
  const numeralScale = popAnim.interpolate({
    inputRange:  [0, 0.3, 1],
    outputRange: [0.6, 1.08, 1],
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: bgPrev }]}>

      {/* Background crossfade overlay (next colour sweeps in) */}
      {n > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: bgNext, opacity: fadeAnim, zIndex: 0 },
          ]}
        />
      )}

      {/* Left film strip */}
      <SprocketStrip side="left" />

      {/* Centre: disc + numeral OR "GO!" */}
      <View style={styles.center}>
        {n > 0 ? (
          /* ── Clock disc ── */
          <View style={{ width: discSize, height: discSize }}>

            <Svg viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
              {/* Disc background */}
              <Circle cx="100" cy="100" r="92" fill="#1A140B" />

              {/* Sweep hand (rotates once per tick) */}
              <AnimatedG key={`hand-${n}`} origin="100, 100" rotation={sweepAnim}>
                <Line
                  x1="100" y1="100" x2="100" y2="8"
                  stroke="#E2A839" strokeWidth="3" strokeLinecap="round"
                />
                <Circle cx="100" cy="10" r="4" fill="#E2A839" stroke="#000" strokeWidth="1.5" />
              </AnimatedG>

              {/* Outer ring, inner rings */}
              <Circle cx="100" cy="100" r="92" fill="none" stroke="#000" strokeWidth="2.5" />
              <Circle cx="100" cy="100" r="80" fill="none" stroke="#000" strokeWidth="2.5" />
              <Circle cx="100" cy="100" r="40" fill="none" stroke="#000" strokeWidth="2.5" />

              {/* Crosshair */}
              <Line x1="0" y1="100" x2="200" y2="100" stroke="#000" strokeWidth="2.5" />
              <Line x1="100" y1="0" x2="100" y2="200" stroke="#000" strokeWidth="2.5" />

              {/* 12 tick marks */}
              {Array.from({ length: 12 }).map((_, i) => {
                const a  = (i * Math.PI) / 6 - Math.PI / 2;
                const x1 = 100 + Math.cos(a) * 80;
                const y1 = 100 + Math.sin(a) * 80;
                const x2 = 100 + Math.cos(a) * 92;
                const y2 = 100 + Math.sin(a) * 92;
                return (
                  <Line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#000" strokeWidth="2.5" strokeLinecap="round"
                  />
                );
              })}

              {/* Centre dot */}
              <Circle cx="100" cy="100" r="4" fill="#000" />
            </Svg>

            {/* Numeral overlay */}
            <Animated.View
              key={`num-${n}`}
              style={[styles.numeralWrap, { transform: [{ scale: numeralScale }] }]}
            >
              <Text
                style={[
                  styles.numeral,
                  { fontSize: numeralSize, lineHeight: Math.round(numeralSize * 1.15) },
                ]}
              >
                {n}
              </Text>
            </Animated.View>

          </View>
        ) : (
          /* ── GO! ── */
          <Animated.View style={{ transform: [{ scale: numeralScale }] }}>
            <Text
              style={[styles.goText, { fontSize: goSize }]}
            >
              GO!
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Right film strip */}
      <SprocketStrip side="right" />

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },

  // Film strips
  strip: {
    width: STRIP_W,
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'space-around',
    paddingVertical: 10,
    zIndex: 2,
  },
  stripLeft: {
    borderRightWidth: 2,
    borderRightColor: '#000',
  },
  stripRight: {
    borderLeftWidth: 2,
    borderLeftColor: '#000',
  },
  hole: {
    width: 26,
    height: 19,
    backgroundColor: '#2D2418',
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#000',
    alignSelf: 'center',
  },

  // Centre column
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  // Numeral
  numeralWrap: {
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
  },

  // GO!
  goText: {
    fontFamily: Fonts.display,
    color: '#E2A839',
    textShadowColor: '#000',
    textShadowOffset: { width: 5, height: 5 },
    textShadowRadius: 1,
  },
});
