import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { Movie } from '@/lib/database.types';
import { cardColor, Fonts, C } from '@/constants/theme';

const lcMysteryCard = require('@/assets/lc-mystery-card.png');

export { cardColor as getCardColor };

// ── CardBack ─────────────────────────────────────────────────────────────────

interface CardSizeProps {
  width: number;
  height: number;
  outlined?: boolean;
}

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
      {/* Subtle center glow overlay */}
      <View style={[StyleSheet.absoluteFill, s.frontGlow, { borderRadius: radius }]} pointerEvents="none" />

      {/* Fixed-proportion sections — each section always occupies the same slice of
          the card regardless of text length. Font shrinks to fit via adjustsFontSizeToFit. */}
      <View style={[s.frontBody, { paddingHorizontal: width * 0.1, paddingVertical: height * 0.08 }]}>
        {/* Director — top slice, flex 2 */}
        <View style={s.frontDirectorSection}>
          <Text
            style={[s.frontDirector, { fontSize: Math.max(6, width * 0.1) }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
          >
            {movie.director ?? ''}
          </Text>
        </View>

        {/* Year — centre slice, flex 5 */}
        <View style={s.frontYearSection}>
          <Text
            style={[s.frontYear, { fontSize: Math.max(12, width * 0.3) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {movie.year}
          </Text>
        </View>

        {/* Title — bottom slice, flex 3 */}
        <View style={s.frontTitleSection}>
          <Text
            style={[s.frontTitle, { fontSize: Math.max(7, width * 0.12) }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
          >
            {movie.title}
          </Text>
        </View>
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
  frontGlow: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  frontBody: {
    flex: 1,
    width: '100%',
  },
  // Fixed-proportion section containers
  frontDirectorSection: {
    flex: 2,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frontYearSection: {
    flex: 5,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frontTitleSection: {
    flex: 3,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frontDirector: {
    alignSelf: 'stretch',
    color: 'rgba(255,255,255,0.75)',
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  frontYear: {
    alignSelf: 'stretch',
    color: '#ffffff',
    fontFamily: Fonts.display,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  frontTitle: {
    alignSelf: 'stretch',
    color: 'rgba(255,255,255,0.9)',
    fontFamily: Fonts.bodyBold,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
