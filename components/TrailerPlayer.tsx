import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Image, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Movie } from '@/lib/database.types';
import { C, Fonts, FS } from '@/constants/theme';

const lcMysteryCard = require('@/assets/lc-mystery-card.png');

export interface TrailerPlayerHandle {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  replay: () => void;
}

interface TrailerPlayerProps {
  movie: Movie;
  onEnded?: () => void;
  onWindowCalculated?: (start: number, end: number) => void;
}

const CAROUSEL = [
  { tx: 0,   ty: 22,  scale: 1.00, zIndex: 3 },
  { tx: 52,  ty: -18, scale: 0.60, zIndex: 2 },
  { tx: -52, ty: -18, scale: 0.60, zIndex: 1 },
];

const SHUFFLE_INTERVALS = [90, 110, 140, 190, 270, 390, 580, 780];
const SETTLE_DELAY = 500; // time after card selection animation before revealing
const SHUFFLE_TOTAL = SHUFFLE_INTERVALS.reduce((a, b) => a + b, 0) + 150 + SETTLE_DELAY; // ~3200ms

// Unmute fires in sync with the reveal so audio never leaks into the overlay
const UNMUTE_DELAY = SHUFFLE_TOTAL;

function makeYouTubeInject(safeStart: number) {
  return `
(function() {
  var notified = false;
  var muted = false;

  setInterval(function() {
    var skip = document.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-slot'
    );
    if (skip) { skip.click(); }
    var close = document.querySelector('.ytp-ad-overlay-close-button');
    if (close) { close.click(); }

    if (!notified && !muted && window.player && typeof window.player.mute === 'function') {
      window.player.mute();
      muted = true;
    }

    if (!notified && window.player &&
        typeof window.player.getPlayerState === 'function' &&
        window.player.getPlayerState() === 1 &&
        !document.documentElement.classList.contains('ad-showing')) {
      notified = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cs_content_ready' }));
      setTimeout(function() {
        window.player.unMute();
        window.player.setVolume(100);
      }, ${UNMUTE_DELAY});
    }
  }, 300);
})();
true;
`;
}

// ── Carousel overlay ──────────────────────────────────────────────────────────

function CarouselOverlay({ onComplete }: { onComplete: () => void }) {
  const posRef              = useRef([0, 1, 2]);
  const [zs, setZs]         = useState([3, 2, 1]);
  const [selected, setSelected] = useState(false);
  const fadeIn              = useRef(new Animated.Value(0)).current;

  const anims = useRef(
    CAROUSEL.map(p => ({
      scale:   new Animated.Value(p.scale),
      tx:      new Animated.Value(p.tx),
      ty:      new Animated.Value(p.ty),
      opacity: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;

    const advance = () => {
      posRef.current = posRef.current.map(p => (p + 1) % 3);
      setZs(posRef.current.map(p => CAROUSEL[p].zIndex));
      anims.forEach((anim, i) => {
        const pos = CAROUSEL[posRef.current[i]];
        const cfg = { friction: 8, tension: 120, useNativeDriver: true };
        Animated.spring(anim.scale, { toValue: pos.scale, ...cfg }).start();
        Animated.spring(anim.tx,    { toValue: pos.tx,    ...cfg }).start();
        Animated.spring(anim.ty,    { toValue: pos.ty,    ...cfg }).start();
      });
    };

    SHUFFLE_INTERVALS.forEach(gap => {
      elapsed += gap;
      timeouts.push(setTimeout(advance, elapsed));
    });

    // Settle: pop the front card and dim the rest
    timeouts.push(setTimeout(() => {
      setSelected(true);
      const frontIdx = posRef.current.indexOf(0);
      Animated.spring(anims[frontIdx].scale, {
        toValue: 1.13, friction: 4, tension: 90, useNativeDriver: true,
      }).start();
      anims.forEach((anim, i) => {
        if (i !== frontIdx) {
          Animated.timing(anim.opacity, { toValue: 0.2, duration: 300, useNativeDriver: true }).start();
        }
      });
    }, elapsed + 150));
    // Notify parent after the card has settled and stood still briefly
    timeouts.push(setTimeout(onComplete, elapsed + 150 + SETTLE_DELAY));

    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <Animated.View style={[overlayStyles.container, { opacity: fadeIn }]}>
      <View style={overlayStyles.cardArea}>
        {anims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[overlayStyles.card, {
              zIndex: zs[i],
              opacity: anim.opacity,
              transform: [
                { translateX: anim.tx },
                { translateY: anim.ty },
                { scale: anim.scale },
              ],
            }]}
          >
            <Image source={lcMysteryCard} style={overlayStyles.cardImg} />
          </Animated.View>
        ))}
      </View>
      <Text style={overlayStyles.title}>
        {selected ? 'Here it comes…' : 'Picking your trailer'}
      </Text>
      <Text style={overlayStyles.sub}>
        {selected ? 'Get ready' : 'Mystery incoming'}
      </Text>
    </Animated.View>
  );
}

// ── TrailerPlayer ─────────────────────────────────────────────────────────────

export const TrailerPlayer = forwardRef<TrailerPlayerHandle, TrailerPlayerProps>(
  function TrailerPlayer({ movie, onEnded, onWindowCalculated }, ref) {
    const { width, height } = useWindowDimensions();

    const ratio    = 16 / 9;
    const byWidth  = { w: width,                     h: Math.round(width / ratio)   };
    const byHeight = { w: Math.round(height * ratio), h: height                     };
    const playerW  = byWidth.h <= height ? byWidth.w : byHeight.w;
    const playerH  = byWidth.h <= height ? byWidth.h : byHeight.h;

    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(true);

    const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerStartRef       = useRef<number>(0);
    const remainingRef        = useRef<number>(0);
    const playerRef           = useRef<any>(null);
    const skipEndTimerOnReady = useRef(false);
    const dynStartRef         = useRef<number>(0);

    // Dual-gate reveal: fires only when both the shuffle is done AND content is ready
    const shuffleDoneRef   = useRef(false);
    const contentReadyRef  = useRef(false);
    const contentReadyAtRef = useRef(0);

    const insaneMode = movie.safe_start === null;
    const safeStart  = movie.safe_start ?? 0;
    const safeEnd    = movie.safe_end ?? (insaneMode ? 99999 : 60);
    const duration   = insaneMode ? 30_000 : Math.max(safeEnd - safeStart, 10) * 1000;
    const youtubeInject = makeYouTubeInject(safeStart);

    function startEndTimer(ms: number = duration) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerStartRef.current = Date.now();
      remainingRef.current  = ms;
      timerRef.current = setTimeout(() => {
        setPlaying(false);
        setLoading(true);
        onEnded?.();
      }, ms);
    }

    function doReveal() {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      const played = contentReadyAtRef.current > 0
        ? Date.now() - contentReadyAtRef.current
        : SHUFFLE_TOTAL;
      setLoading(false);
      if (!skipEndTimerOnReady.current) {
        startEndTimer(Math.max(duration - played, 5000));
      }
    }

    function onShuffleDone() {
      shuffleDoneRef.current = true;
      if (contentReadyRef.current) {
        doReveal();
      } else {
        fallbackRef.current = setTimeout(doReveal, 600);
      }
    }

    useImperativeHandle(ref, () => ({
      pause() {
        const elapsed = Date.now() - timerStartRef.current;
        remainingRef.current = Math.max(remainingRef.current - elapsed, 0);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setPlaying(false);
      },
      resume() {
        setPlaying(true);
        startEndTimer(remainingRef.current);
      },
      stop() {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        setPlaying(false);
        setLoading(true);
      },
      replay() {
        setLoading(true);
        shuffleDoneRef.current  = false;
        contentReadyRef.current = false;
        contentReadyAtRef.current = 0;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        skipEndTimerOnReady.current = false;
        setPlaying(false);
        const replayStart = insaneMode ? dynStartRef.current : safeStart;
        setTimeout(() => {
          playerRef.current?.seekTo(replayStart, true);
          setPlaying(true);
          fallbackRef.current = setTimeout(() => {
            setLoading(false);
            startEndTimer(insaneMode ? 30_000 : duration);
          }, 3000);
        }, 300);
      },
    }));

    async function handleYouTubeReady() {
      if (insaneMode) {
        skipEndTimerOnReady.current = true;
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        try {
          const totalSec: number = (await playerRef.current?.getDuration()) ?? 120;
          const mid      = totalSec / 2;
          const dynStart = Math.max(0, mid - 15);
          const dynEnd   = dynStart + 30;
          dynStartRef.current = dynStart;
          playerRef.current?.seekTo(dynStart, true);
          onWindowCalculated?.(dynStart, dynEnd);
        } catch (_) {
          dynStartRef.current = 0;
        }
        // Fallback in case cs_content_ready never fires
        fallbackRef.current = setTimeout(() => {
          if (!contentReadyRef.current) doReveal();
        }, SHUFFLE_TOTAL + 3000);
      } else {
        playerRef.current?.seekTo(safeStart, true);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        // Fallback in case cs_content_ready never fires
        fallbackRef.current = setTimeout(() => {
          if (!contentReadyRef.current) doReveal();
        }, SHUFFLE_TOTAL + 3000);
      }
    }

    function handleYouTubeStateChange(state: string) {
      if (state === 'ended') {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        setLoading(true);
        onEnded?.();
      }
    }

    function handleWebViewMessage(event: { nativeEvent: { data: string } }) {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'cs_content_ready') {
          contentReadyRef.current   = true;
          contentReadyAtRef.current = Date.now();
          if (shuffleDoneRef.current) doReveal();
          // else: wait for shuffle to complete — onShuffleDone will trigger doReveal
        }
      } catch (_) {}
    }

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
      };
    }, []);

    return (
      <View style={styles.container}>
        <YoutubePlayer
            ref={playerRef}
            height={playerH}
            width={playerW}
            videoId={movie.youtube_id!}
            play={playing}
            initialPlayerParams={{
              start: safeStart,
              end: safeEnd,
              mute: true,
              controls: false,
              rel: false,
              iv_load_policy: 3,
              loop: false,
              modestbranding: true,
            }}
            onReady={handleYouTubeReady}
            onChangeState={handleYouTubeStateChange}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
              injectedJavaScript: youtubeInject,
              onMessage: handleWebViewMessage,
            }}
          />

        {loading && (
          <View style={styles.loader}>
            <CarouselOverlay key={String(loading)} onComplete={onShuffleDone} />
          </View>
        )}
      </View>
    );
  }
);

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  cardArea: {
    width: 180,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
  },
  cardImg: {
    width: 115,
    height: 161,
    resizeMode: 'contain',
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.textPrimary,
    letterSpacing: 0.4,
  },
  sub: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textSub,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
    zIndex: 10,
  },
});
