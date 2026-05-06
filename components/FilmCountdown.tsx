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

// ── Colour palette ─────────────────────────────────────────────────────────────
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
    <View style={[styles.strip, side === 'left' ? styles.stripLeft : styles.stripRight]}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
interface FilmCountdownProps {
  from?: number;
  onComplete?: () => void;
}

export default function FilmCountdown({ from = 3, onComplete }: FilmCountdownProps) {
  const { width: sw, height: sh } = useWindowDimensions();

  const [displayN, setDisplayN] = useState(from);  // current number shown
  const [sweepDeg, setSweepDeg] = useState(0);      // hand angle 0–360

  const popAnim  = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // stable refs — safe to read from inside the RAF closure
  const popAnimRef  = useRef(popAnim);
  const fadeAnimRef = useRef(fadeAnim);
  const tickPlayer  = useAudioPlayer(require('../assets/sounds/countdown-tick.wav'));
  const tickRef     = useRef(tickPlayer);
  const doneRef     = useRef(false);
  const prevNRef    = useRef(from);

  // Disc sizing
  const discSize    = Math.min(sh * 0.88, sw - STRIP_W * 2 - 16);
  const numeralSize = Math.round(discSize * 0.44);
  const goSize      = Math.round(discSize * 0.38);

  // ── One-off animations fired whenever the displayed number changes ─────────
  // Called from the RAF callback — only touches stable animated refs.
  function fireTickAnims(n: number) {
    try { tickRef.current.seekTo(0); tickRef.current.play(); } catch { /* silent */ }

    popAnimRef.current.setValue(0);
    Animated.timing(popAnimRef.current, {
      toValue: 1, duration: 460,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();

    if (n > 0) {
      fadeAnimRef.current.setValue(0);
      Animated.timing(fadeAnimRef.current, {
        toValue: 1, duration: 980,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    }
  }

  // ── Single RAF loop — both sweep angle and number derived from same clock ──
  useEffect(() => {
    doneRef.current = false;
    prevNRef.current = from;
    fireTickAnims(from); // animate first number immediately

    const start = Date.now();
    let rafId: number;
    let goTimer: ReturnType<typeof setTimeout> | null = null;

    const frame = () => {
      const elapsed = Date.now() - start;

      // ── Countdown complete → GO! ──
      if (elapsed >= from * 1000) {
        if (!doneRef.current) {
          doneRef.current = true;
          setDisplayN(0);
          setSweepDeg(0);
          fireTickAnims(0);
          goTimer = setTimeout(() => onComplete?.(), 700);
        }
        return; // stop scheduling new frames
      }

      // ── Normal tick ──
      // Number changes at exactly the same elapsed-time boundary as the sweep
      // resetting to 0°, so hand and numeral are always in lock-step.
      const tickIdx = Math.floor(elapsed / 1000);
      const newN    = from - tickIdx;
      const deg     = ((elapsed % 1000) / 1000) * 360;

      setSweepDeg(deg);

      if (newN !== prevNRef.current) {
        prevNRef.current = newN;
        setDisplayN(newN);
        fireTickAnims(newN);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      if (goTimer) clearTimeout(goTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Colour cycle ───────────────────────────────────────────────────────────
  const bgIdx  = (from - displayN) % BG_COLORS.length;
  const bgPrev = BG_COLORS[bgIdx];
  const bgNext = BG_COLORS[(bgIdx + 1) % BG_COLORS.length];

  // ── Numeral scale ──────────────────────────────────────────────────────────
  const numeralScale = popAnim.interpolate({
    inputRange:  [0, 0.3, 1],
    outputRange: [0.6, 1.08, 1],
  });

  // ── Sweep hand endpoint (12-o'clock + rotation) ───────────────────────────
  const rad = ((sweepDeg - 90) * Math.PI) / 180;
  const hx  = 100 + Math.cos(rad) * 84;
  const hy  = 100 + Math.sin(rad) * 84;
  const tx  = 100 + Math.cos(rad) * 82;
  const ty  = 100 + Math.sin(rad) * 82;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: bgPrev }]}>

      {/* Background crossfade overlay */}
      {displayN > 0 && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: bgNext, opacity: fadeAnim }]}
        />
      )}

      <SprocketStrip side="left" />

      <View style={styles.center}>
        {displayN > 0 ? (
          <View style={{ width: discSize, height: discSize }}>

            <Svg viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
              <Circle cx="100" cy="100" r="92" fill="#1A140B" />

              {/* Sweep hand */}
              <G>
                <Line x1="100" y1="100" x2={hx} y2={hy}
                  stroke="#E2A839" strokeWidth="3" strokeLinecap="round" />
                <Circle cx={tx} cy={ty} r="4" fill="#E2A839" stroke="#000" strokeWidth="1.5" />
              </G>

              <Circle cx="100" cy="100" r="92" fill="none" stroke="#000" strokeWidth="2.5" />
              <Circle cx="100" cy="100" r="80" fill="none" stroke="#000" strokeWidth="2.5" />
              <Circle cx="100" cy="100" r="40" fill="none" stroke="#000" strokeWidth="2.5" />

              <Line x1="0"   y1="100" x2="200" y2="100" stroke="#000" strokeWidth="2.5" />
              <Line x1="100" y1="0"   x2="100" y2="200" stroke="#000" strokeWidth="2.5" />

              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i * Math.PI) / 6 - Math.PI / 2;
                return (
                  <Line key={i}
                    x1={100 + Math.cos(a) * 80} y1={100 + Math.sin(a) * 80}
                    x2={100 + Math.cos(a) * 92} y2={100 + Math.sin(a) * 92}
                    stroke="#000" strokeWidth="2.5" strokeLinecap="round"
                  />
                );
              })}

              <Circle cx="100" cy="100" r="4" fill="#000" />
            </Svg>

            <Animated.View
              key={`num-${displayN}`}
              style={[styles.overlay, { transform: [{ scale: numeralScale }] }]}
            >
              <Text style={[styles.numeral, { fontSize: numeralSize }]}>{displayN}</Text>
            </Animated.View>

          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: numeralScale }] }}>
            <Text style={[styles.goText, { fontSize: goSize }]}>GO!</Text>
          </Animated.View>
        )}
      </View>

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
    width: STRIP_W,
    backgroundColor: '#0a0a0a',
    justifyContent: 'space-around',
    paddingVertical: 10,
    alignSelf: 'stretch',
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
  },
  goText: {
    fontFamily: Fonts.display,
    color: '#E2A839',
    textShadowColor: '#000',
    textShadowOffset: { width: 5, height: 5 },
    textShadowRadius: 1,
  },
});
