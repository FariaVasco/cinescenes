/**
 * Cinescenes cinema-vocabulary icon set — Ligne Claire edition.
 *
 * Functional icons (24×24 viewBox, 2px stroke, no fill):
 *   ClapperboardIcon, FilmReelIcon, ProjectorIcon, FilmStripIcon,
 *   DirectorChairIcon, CoinIcon, BoomMicIcon, SpotlightIcon,
 *   CastToTVIcon, CardFlipIcon
 *
 * Decorative silhouettes (filled, for background use at low opacity):
 *   DecoFilmReel, DecoClapperboard, DecoStar
 */

import Svg, {
  Circle, Line, Path, Rect, G,
} from 'react-native-svg';
import { C } from '@/constants/theme';

// ── Shared prop type ──────────────────────────────────────────────────────────

interface IconProps {
  size?: number;
  color?: string;
  opacity?: number;
}

// ── Functional icons (2px stroke, stroke-only, no fill) ───────────────────────

export function ClapperboardIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Path
        d="M3 8l18-3v14a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M7 5l4 3M13 5l4 3M19 5l-3 3"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FilmReelIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="5"  r="1.5" stroke={color} strokeWidth="2" />
      <Circle cx="12" cy="19" r="1.5" stroke={color} strokeWidth="2" />
      <Circle cx="5"  cy="12" r="1.5" stroke={color} strokeWidth="2" />
      <Circle cx="19" cy="12" r="1.5" stroke={color} strokeWidth="2" />
      <Circle cx="8"  cy="8"  r="1.5" stroke={color} strokeWidth="2" />
      <Circle cx="16" cy="16" r="1.5" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export function ProjectorIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Rect x="2" y="7" width="10" height="10" rx="2" stroke={color} strokeWidth="2" />
      <Circle cx="7" cy="12" r="3" stroke={color} strokeWidth="2" />
      <Path
        d="M12 9h10l-2 6h-8"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Circle cx="5" cy="5" r="1" stroke={color} strokeWidth="2" />
      <Circle cx="9" cy="5" r="1" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export function FilmStripIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Rect x="4" y="2" width="16" height="20" rx="1" stroke={color} strokeWidth="2" />
      <Line x1="4" y1="7"  x2="20" y2="7"  stroke={color} strokeWidth="2" />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth="2" />
      <Line x1="4" y1="17" x2="20" y2="17" stroke={color} strokeWidth="2" />
      <Rect x="6"  y="4"  width="2" height="1" fill={color} />
      <Rect x="6"  y="9"  width="2" height="1" fill={color} />
      <Rect x="6"  y="14" width="2" height="1" fill={color} />
      <Rect x="6"  y="19" width="2" height="1" fill={color} />
      <Rect x="16" y="4"  width="2" height="1" fill={color} />
      <Rect x="16" y="9"  width="2" height="1" fill={color} />
      <Rect x="16" y="14" width="2" height="1" fill={color} />
      <Rect x="16" y="19" width="2" height="1" fill={color} />
    </Svg>
  );
}

export function DirectorChairIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Path d="M5 3v18M19 3v18" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Rect x="3" y="10" width="18" height="6" rx="1" stroke={color} strokeWidth="2" />
      <Path
        d="M7 10V8a1 1 0 011-1h8a1 1 0 011 1v2"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M5 16l7 5M19 16l-7 5"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CoinIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <Path
        d="M12 6l1.5 4.5h4.5l-3.5 2.5 1.5 4.5-3.5-2.5-3.5 2.5 1.5-4.5-3.5-2.5h4.5L12 6z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BoomMicIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Path d="M3 3l15 15" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Rect
        x="15" y="15" width="5" height="6" rx="1.5"
        transform="rotate(45 17.5 18)"
        stroke={color} strokeWidth="2"
      />
      <Circle cx="19" cy="19" r="0.5" fill={color} />
    </Svg>
  );
}

export function SpotlightIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2" />
      <Path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke={color} strokeWidth="2" strokeLinecap="round"
      />
    </Svg>
  );
}

export function CastToTVIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Path
        d="M2 8V6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2h-6"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M2 12a9 9 0 019 9M2 16a5 5 0 015 5M2 20h.01"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CardFlipIcon({ size = 24, color = C.ink, opacity = 1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" opacity={opacity}>
      <Rect x="3" y="5" width="8" height="14" rx="2" stroke={color} strokeWidth="2" />
      <Path
        d="M13 7h6a2 2 0 012 2v8a2 2 0 01-2 2h-6"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M16 12h3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Decorative silhouettes ─────────────────────────────────────────────────────
// On light surfaces: ink fills at low opacity
// On dark surfaces: pass light=true for parchment fills

interface DecoProps {
  size?: number;
  opacity?: number;
  light?: boolean; // true = render as light (for dark backgrounds)
}

export function DecoFilmReel({ size = 96, opacity = 0.08, light = false }: DecoProps) {
  const base = light ? '255,255,255' : '26,26,26';
  const fill = `rgba(${base},${opacity})`;
  const cutout = light ? '#1A1A1A' : '#FAFAF7';
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Circle cx="48" cy="48" r="44" fill={fill} />
      <Circle cx="48" cy="48" r="16" fill={cutout} />
      <Circle cx="48" cy="16" r="6" fill={fill} />
      <Circle cx="48" cy="80" r="6" fill={fill} />
      <Circle cx="16" cy="48" r="6" fill={fill} />
      <Circle cx="80" cy="48" r="6" fill={fill} />
      <Circle cx="24" cy="24" r="6" fill={fill} />
      <Circle cx="72" cy="72" r="6" fill={fill} />
      <Circle cx="24" cy="72" r="6" fill={fill} />
      <Circle cx="72" cy="24" r="6" fill={fill} />
    </Svg>
  );
}

export function DecoClapperboard({ size = 96, opacity = 0.08, light = false }: DecoProps) {
  const base = light ? '255,255,255' : '26,26,26';
  const fill = `rgba(${base},${opacity})`;
  const cutout = light ? '#1A1A1A' : '#FAFAF7';
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Rect x="8"  y="8"  width="80" height="24" rx="3" fill={fill} />
      <Rect x="8"  y="32" width="80" height="56" rx="3" fill={fill} />
      <Rect x="12" y="12" width="12" height="16" fill={cutout} />
      <Rect x="28" y="12" width="12" height="16" fill={cutout} />
      <Rect x="44" y="12" width="12" height="16" fill={cutout} />
      <Rect x="60" y="12" width="12" height="16" fill={cutout} />
    </Svg>
  );
}

export function DecoStar({ size = 64, opacity = 0.08, light = false }: DecoProps) {
  const base = light ? '255,255,255' : '26,26,26';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 4l8 16 18 3-13 12 3 18-16-9-16 9 3-18-13-12 18-3 8-16z"
        fill={`rgba(${base},${opacity})`}
      />
    </Svg>
  );
}
