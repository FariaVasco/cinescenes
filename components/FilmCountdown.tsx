import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, G, Path } from 'react-native-svg';
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

// ── Sector path helper ─────────────────────────────────────────────────────────
// Produces an SVG path for a pie sector from 12 o'clock clockwise by `deg` degrees,
// large enough to cover the entire screen (uses screen diagonal as radius).
function sectorPath(deg: number, cx: number, cy: number, r: number): string {
  if (deg <= 0) return '';
  if (deg >= 360) return `M 0 0 H ${cx * 2} V ${cy * 2} H 0 Z`; // full rect
  const rad       = ((deg - 90) * Math.PI) / 180;
  const ex        = cx + r * Math.cos(rad);
  const ey        = cy + r * Math.sin(rad);
  const largeArc  = deg > 180 ? 1 : 0;
  // Start at 12 o'clock (cx, cy-r), arc clockwise to (ex, ey)
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey} Z`;
}

// ── Component ──────────────────────────────────────────────────────────────────
interface FilmCountdownProps {
  from?: number;
  onComplete?: () => void;
}

export default function FilmCountdown({ from = 3, onComplete }: FilmCountdownProps) {
  const { width: sw, height: sh } = useWindowDimensions();

  const [displayN, setDisplayN] = useState(from);
  const [sweepDeg, setSweepDeg] = useState(0);

  const popAnim    = useRef(new Animated.Value(0)).current;
  const popAnimRef = useRef(popAnim);
  const tickPlayer = useAudioPlayer(require('../assets/sounds/countdown-tick.wav'));
  const tickRef    = useRef(tickPlayer);
  const doneRef    = useRef(false);
  const prevNRef   = useRef(from);

  // Disc sizing
  const discSize    = Math.min(sh * 0.88, sw - STRIP_W * 2 - 16);
  const numeralSize = Math.round(discSize * 0.44);
  const goSize      = Math.round(discSize * 0.38);

  // Sector geometry — radius covers full screen diagonal
  const cx = sw / 2;
  const cy = sh / 2;
  const r  = Math.sqrt(sw * sw + sh * sh) / 2;

  // ── Per-tick animations (called from RAF — only touches stable refs) ────────
  function fireTickAnims(n: number) {
    try { tickRef.current.seekTo(0); tickRef.current.play(); } catch { /* silent */ }
    popAnimRef.current.setValue(0);
    Animated.timing(popAnimRef.current, {
      toValue: 1, duration: 460,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }

  // ── Single RAF loop — number and sweep derived from one clock ───────────────
  useEffect(() => {
    doneRef.current  = false;
    prevNRef.current = from;
    fireTickAnims(from);

    const start = Date.now();
    let rafId: number;
    let goTimer: ReturnType<typeof setTimeout> | null = null;

    const frame = () => {
      const elapsed = Date.now() - start;

      if (elapsed >= from * 1000) {
        if (!doneRef.current) {
          doneRef.current = true;
          setDisplayN(0);
          setSweepDeg(0);
          fireTickAnims(0);
          goTimer = setTimeout(() => onComplete?.(), 700);
        }
        return;
      }

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

  // ── Sweep hand endpoint ───────────────────────────────────────────────────
  const handRad = ((sweepDeg - 90) * Math.PI) / 180;
  const hx = 100 + Math.cos(handRad) * 84;
  const hy = 100 + Math.sin(handRad) * 84;
  const tx = 100 + Math.cos(handRad) * 82;
  const ty = 100 + Math.sin(handRad) * 82;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: bgPrev }]}>

      {/* Paint-sweep overlay: next colour revealed as a growing pie sector
          that tracks the sweep hand — matches the CSS clip-path in the web version */}
      {displayN > 0 && sweepDeg > 0 && (
        <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${sw} ${sh}`}>
          <Path d={sectorPath(sweepDeg, cx, cy, r)} fill={bgNext} />
        </Svg>
      )}

      <SprocketStrip side="left" />

      <View style={styles.center}>
        {displayN > 0 ? (
          <View style={{ width: discSize, height: discSize }}>

            <Svg viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
              <Circle cx="100" cy="100" r="92" fill="#1A140B" />

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
              style={[styles.overlay, { transform: [{ scale: numeralScale }] }]}
            >
              <Text style={[styles.numeral, { fontSize: numeralSize }]}>{displayN}</Text>
            </Animated.View>

          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: numeralScale }] }}>
            <Text style={[styles.goText, { fontSize: goSize }]}>LET'S GO!</Text>
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
