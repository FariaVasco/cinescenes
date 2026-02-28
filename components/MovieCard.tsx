import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Movie } from '@/lib/database.types';

// ── Card color palette ────────────────────────────────────────────────────────
const CARD_COLORS = [
  '#6d3014', '#4c1247', '#0d3b6e', '#1a4731', '#5c1a1a',
  '#2d1854', '#4a3000', '#1a3d2b', '#3d1a00', '#0a3d62', '#2c1654', '#1a2e1a',
];

export function getCardColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_COLORS[h % CARD_COLORS.length];
}

// ── CardBack ─────────────────────────────────────────────────────────────────
// Classy typographic design — pure View/Text, no SVG overhead.

interface CardSizeProps {
  width: number;
  height: number;
}

export function CardBack({ width, height }: CardSizeProps) {
  const radius = Math.max(6, width * 0.08);
  const pad = Math.max(5, width * 0.09);

  return (
    <View style={[s.shell, { width, height, borderRadius: radius }]}>
      {/* Outer gold border frame */}
      <View style={[s.frame1, { top: pad, left: pad, right: pad, bottom: pad, borderRadius: radius * 0.55 }]} />
      {/* Inner hairline frame */}
      <View style={[s.frame2, {
        top: pad + 4, left: pad + 4, right: pad + 4, bottom: pad + 4,
        borderRadius: radius * 0.3,
      }]} />

      {/* Centre emblem */}
      <View style={s.emblem}>
        <Text style={[s.star, { fontSize: Math.max(8, width * 0.1) }]}>✦</Text>
        <Text style={[s.word, { fontSize: Math.max(7, width * 0.105), letterSpacing: Math.max(2, width * 0.04) }]}>CINE</Text>
        <View style={[s.rule, { width: width * 0.36 }]} />
        <Text style={[s.word, { fontSize: Math.max(7, width * 0.105), letterSpacing: Math.max(1, width * 0.02) }]}>SCENES</Text>
        <Text style={[s.star, { fontSize: Math.max(8, width * 0.1) }]}>✦</Text>
      </View>
    </View>
  );
}

// ── CardFront ─────────────────────────────────────────────────────────────────

interface CardFrontProps extends CardSizeProps {
  movie: Movie;
}

export function CardFront({ movie, width, height }: CardFrontProps) {
  const radius = Math.max(6, width * 0.08);
  const bg = getCardColor(movie.id);

  return (
    <View style={[s.shell, { width, height, borderRadius: radius, backgroundColor: bg }]}>
      <View style={[s.frontBody, { paddingHorizontal: width * 0.1, paddingVertical: height * 0.1 }]}>
        {movie.director ? (
          <Text
            style={[s.frontDirector, { fontSize: Math.max(6, width * 0.09) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {movie.director}
          </Text>
        ) : null}
        <Text style={[s.frontYear, { fontSize: Math.max(18, width * 0.28) }]}>
          {movie.year}
        </Text>
        <Text
          style={[s.frontTitle, { fontSize: Math.max(7, width * 0.1) }]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
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
    backgroundColor: '#0d0820',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Outer gold border frame (absolute inset)
  frame1: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: `${GOLD}0.5)`,
  },
  // Inner hairline frame
  frame2: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${GOLD}0.22)`,
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
    fontWeight: '800',
    textAlign: 'center',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: `${GOLD}0.3)`,
    marginVertical: 2,
  },
  // ── CardFront ──
  frontBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  frontDirector: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  frontYear: {
    color: '#ffffff',
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  frontTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
