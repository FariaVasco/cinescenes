import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Path, Rect, Circle, Defs, ClipPath, G, Line } from 'react-native-svg';
import { Fonts } from '@/constants/theme';

const VERMILLION = '#E8372A';
const OCHRE      = '#F5C518';
const CERULEAN   = '#54B0D9';

interface AnimatedHourglassProps {
  durationMs: number;
  progress: number; // 0 to 1
  size?: number;    // width in px, default 80 (height scales at 104/80)
  urgent?: boolean;
}

/**
 * Ligne Claire animated hourglass — React Native SVG version.
 * Sand depletes from the top bulb and fills the bottom as progress goes 0→1.
 */
export default function AnimatedHourglass({ progress, size = 80, urgent = false }: AnimatedHourglassProps) {
  const s = size / 80; // scale factor

  // ── Geometry (original at 80×104) ──────────────────────────────────────────
  const W  = size;
  const H  = size * (104 / 80);
  const cx = 40 * s;
  const capH    = 5  * s;
  const topCapY = 10 * s;
  const botCapY = 94 * s; // (104-10)
  const glassTop = topCapY + capH; // 15s
  const glassBot = botCapY - capH; // 89s
  const midY  = (glassTop + glassBot) / 2;
  const bulbW = 22 * s;
  const neckW =  3 * s;
  const capW  = 27 * s; // bulbW+5
  const sw    = 2.5 * s;

  // ── Colours ─────────────────────────────────────────────────────────────────
  const ink        = urgent ? VERMILLION : CERULEAN;
  const sand       = OCHRE;
  const sandStream = '#C89B10';
  const capColor   = '#3A2E22';

  // ── Bezier helpers ──────────────────────────────────────────────────────────
  const tSpan = midY - glassTop;
  const t1 = tSpan * 0.65;
  const t2 = tSpan * 0.15;

  const bSpan = glassBot - midY;
  const b1 = bSpan * 0.15;
  const b2 = bSpan * 0.65;

  // ── Paths ───────────────────────────────────────────────────────────────────
  const topBulbD = [
    `M ${cx - bulbW} ${glassTop}`,
    `C ${cx - bulbW} ${glassTop + t1} ${cx - neckW} ${midY - t2} ${cx - neckW} ${midY}`,
    `L ${cx + neckW} ${midY}`,
    `C ${cx + neckW} ${midY - t2} ${cx + bulbW} ${glassTop + t1} ${cx + bulbW} ${glassTop}`,
    'Z',
  ].join(' ');

  const botBulbD = [
    `M ${cx - neckW} ${midY}`,
    `C ${cx - neckW} ${midY + b1} ${cx - bulbW} ${glassBot - b2} ${cx - bulbW} ${glassBot}`,
    `L ${cx + bulbW} ${glassBot}`,
    `C ${cx + bulbW} ${glassBot - b2} ${cx + neckW} ${midY + b1} ${cx + neckW} ${midY}`,
    'Z',
  ].join(' ');

  // ── Sand levels ─────────────────────────────────────────────────────────────
  const topSandFrac = 1 - progress;
  const botSandFrac = progress;

  const maxTopSandH = tSpan - 6 * s;
  const topSandH = maxTopSandH * topSandFrac;
  const topSandY = midY - 2 * s - topSandH;

  const maxBotSandH = bSpan - 6 * s;
  const botSandH = maxBotSandH * botSandFrac;
  const botSandY = glassBot - botSandH;

  const streamEnd = midY + 8 * s + Math.min(botSandFrac * 12 * s, 12 * s);

  return (
    <Svg width={W} height={H}>
      <Defs>
        <ClipPath id="hgTop">
          <Path d={topBulbD} />
        </ClipPath>
        <ClipPath id="hgBot">
          <Path d={botBulbD} />
        </ClipPath>
      </Defs>

      {/* Top sand (clipped to top bulb) */}
      {topSandFrac > 0.01 && (
        <G clipPath="url(#hgTop)">
          <Rect
            x={cx - bulbW} y={topSandY}
            width={bulbW * 2} height={topSandH + 2 * s}
            fill={sand}
          />
        </G>
      )}

      {/* Bottom sand (clipped to bottom bulb) */}
      {botSandFrac > 0.01 && (
        <G clipPath="url(#hgBot)">
          <Rect
            x={cx - bulbW} y={botSandY}
            width={bulbW * 2} height={botSandH}
            fill={sand}
          />
        </G>
      )}

      {/* Falling sand stream */}
      {progress < 0.97 && (
        <Line
          x1={cx} y1={midY - 6 * s}
          x2={cx} y2={streamEnd}
          stroke={sandStream} strokeWidth={1.5 * s} strokeLinecap="round"
        />
      )}

      {/* Glass outlines */}
      <Path d={topBulbD} stroke={ink} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={botBulbD} stroke={ink} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Caps */}
      <Rect x={cx - capW} y={topCapY} width={capW * 2} height={capH} rx={2 * s}
        fill={capColor} stroke={ink} strokeWidth={sw} />
      <Rect x={cx - capW} y={botCapY - capH} width={capW * 2} height={capH} rx={2 * s}
        fill={capColor} stroke={ink} strokeWidth={sw} />

      {/* Decorative dots on caps */}
      <Circle cx={cx - capW + 5 * s} cy={topCapY + capH / 2} r={1.5 * s} fill={ink} />
      <Circle cx={cx + capW - 5 * s} cy={topCapY + capH / 2} r={1.5 * s} fill={ink} />
      <Circle cx={cx - capW + 5 * s} cy={botCapY - capH / 2} r={1.5 * s} fill={ink} />
      <Circle cx={cx + capW - 5 * s} cy={botCapY - capH / 2} r={1.5 * s} fill={ink} />
    </Svg>
  );
}

// ── HourglassTimer ────────────────────────────────────────────────────────────
// Self-contained: drives progress via setInterval, calls onExpire at 100%.

interface HourglassTimerProps {
  durationMs: number;
  onExpire?: () => void;
  size?: number;
  label?: string;
}

export function HourglassTimer({ durationMs, onExpire, size = 80, label }: HourglassTimerProps) {
  const [progress, setProgress] = useState(0);
  const firedRef = useRef(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const shakeLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    firedRef.current = false;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / durationMs, 1);
      setProgress(p);
      if (p >= 1 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(id);
        onExpire?.();
      }
    }, 50);
    return () => clearInterval(id);
  }, []); // run once on mount

  const secsLeft = Math.ceil((1 - progress) * durationMs / 1000);
  const urgent = secsLeft <= 5 && secsLeft > 0;

  // Start/stop shake loop when urgency changes
  useEffect(() => {
    if (urgent) {
      shakeLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: -4, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue:  4, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -4, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue:  4, duration: 55, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue:  0, duration: 55, useNativeDriver: true }),
          Animated.delay(350),
        ])
      );
      shakeLoopRef.current.start();
    } else {
      shakeLoopRef.current?.stop();
      shakeLoopRef.current = null;
      shakeAnim.setValue(0);
    }
    return () => {
      shakeLoopRef.current?.stop();
      shakeLoopRef.current = null;
    };
  }, [urgent]);

  return (
    <Animated.View style={[hStyles.wrap, { transform: [{ translateX: shakeAnim }] }]}>
      <AnimatedHourglass durationMs={durationMs} progress={progress} size={size} urgent={urgent} />
      <Text style={[hStyles.secs, { fontSize: Math.max(10, size * 0.22), color: urgent ? VERMILLION : OCHRE }]}>
        {secsLeft}s{label ? ` ${label}` : ''}
      </Text>
    </Animated.View>
  );
}

const hStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  secs: { fontFamily: Fonts.display, lineHeight: 16, textAlign: 'center' },
});
