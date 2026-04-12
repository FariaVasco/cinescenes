import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { Movie } from '@/lib/database.types';
import { cardColor, Fonts, C } from '@/constants/theme';

const lcMysteryCard = require('@/assets/lc-mystery-card.png');
const lcCardFront   = require('@/assets/lc-card-front.png');

export { cardColor as getCardColor };

// ── CardBack ─────────────────────────────────────────────────────────────────

interface CardSizeProps {
  width: number;
  height: number;
  outlined?: boolean;
}

// How much to overscan the PNG to clip its transparent padding.
// PNG is 1068×1333 (4:5). Reduce this value if card details are clipped.
// 1.0 = show full PNG; 1.1 = clip ~5% from each edge; 1.45 = clip ~15%.
const BACK_SCALE = 1.0;

export function CardBack({ width, height, outlined = false }: CardSizeProps) {
  const radius = Math.max(6, width * 0.08);

  return (
    <View style={[s.shell, s.backShell, { width, height, borderRadius: radius }, outlined && s.shellOutlined]}>
      <Image
        source={lcMysteryCard}
        style={{ width: width * BACK_SCALE, height: height * BACK_SCALE }}
        resizeMode="stretch"
      />
    </View>
  );
}

// ── CardFront ─────────────────────────────────────────────────────────────────

interface CardFrontProps extends CardSizeProps {
  movie: Movie;
}

export function CardFront({ movie, width, height }: CardFrontProps) {
  const radius = Math.max(6, width * 0.08);
  const bg = cardColor(movie.year);

  return (
    <View style={[s.shell, { width, height, borderRadius: radius, backgroundColor: bg }]}>

      {/* PNG frame — rendered first so text sits on top of the film strip */}
      <Image
        source={lcCardFront}
        style={{ position: 'absolute', top: 0, left: 0, width, height }}
        resizeMode="stretch"
        pointerEvents="none"
      />

      {/* Director — between the two chairs (x 29%–71%, y 11%–25%) */}
      <View style={[s.frontZone, {
        top: height * 0.11,
        left: width * 0.29,
        width: width * 0.42,
        height: height * 0.14,
      }]}>
        <Text
          style={[s.frontDirector, { fontSize: Math.max(6, width * 0.10) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.25}
        >
          {movie.director ?? ''}
        </Text>
      </View>

      {/* Year — large transparent center (x 15%–85%, y 33%–68%) */}
      <View style={[s.frontZone, {
        top: height * 0.33,
        left: width * 0.15,
        width: width * 0.70,
        height: height * 0.35,
      }]}>
        <Text
          style={[s.frontYear, { fontSize: Math.max(12, width * 0.26) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {movie.year}
        </Text>
      </View>

      {/* Title — inside the film strip (x 8%–92%, y 77%–91%) */}
      <View style={[s.frontZone, {
        top: height * 0.77,
        left: width * 0.08,
        width: width * 0.84,
        height: height * 0.14,
      }]}>
        <Text
          style={[s.frontTitle, { fontSize: Math.max(7, width * 0.10) }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.25}
        >
          {movie.title}
        </Text>
      </View>

    </View>
  );
}

// ── FlippingMovieCard ─────────────────────────────────────────────────────────

export interface FlippingMovieCardRef {
  flip: () => void;
}

interface FlippingMovieCardProps extends CardSizeProps {
  movie: Movie;
  autoFlip?: boolean;
}

export const FlippingMovieCard = forwardRef<FlippingMovieCardRef, FlippingMovieCardProps>(
  function FlippingMovieCard({ movie, width, height, autoFlip = false }, ref) {
    const flipAnim = useRef(new Animated.Value(0)).current;

    const doFlip = () => {
      Animated.timing(flipAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    };

    useImperativeHandle(ref, () => ({ flip: doFlip }));

    useEffect(() => {
      if (autoFlip) {
        const t = setTimeout(doFlip, 300);
        return () => clearTimeout(t);
      }
    }, [autoFlip]);

    const backRotate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg',   '90deg'] });
    const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg']  });

    return (
      <View style={{ width, height }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ perspective: 800 }, { rotateY: backRotate  }] }]}>
          <CardBack  width={width} height={height} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ perspective: 800 }, { rotateY: frontRotate }] }]}>
          <CardFront movie={movie} width={width} height={height} />
        </Animated.View>
      </View>
    );
  }
);

// ── Styles ────────────────────────────────────────────────────────────────────

const GOLD = 'rgba(245,197,24,';

const s = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backShell: {
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.ink,
  },
  shellOutlined: {
    borderWidth: 2,
    borderColor: C.ink,
  },
  // Outer ink border frame (absolute inset)
  frame1: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(26,26,26,0.15)',
  },
  // Inner hairline frame
  frame2: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26,26,26,0.08)',
  },
  emblem: {
    alignItems: 'center',
    gap: 3,
  },
  star: {
    color: `${GOLD}0.55)`,
  },
  word: {
    color: `${GOLD}0.88)`,
    fontFamily: Fonts.display,
    textAlign: 'center',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: `${GOLD}0.3)`,
    marginVertical: 2,
  },
  // ── CardFront ──
  frontZone: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frontDirector: {
    width: '100%',
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  frontYear: {
    width: '100%',
    color: '#ffffff',
    fontFamily: Fonts.display,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  frontTitle: {
    width: '100%',
    color: 'rgba(255,255,255,0.95)',
    fontFamily: Fonts.bodyBold,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
