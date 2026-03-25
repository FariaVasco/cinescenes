import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Movie } from '@/lib/database.types';

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

// Skips skippable ads, detects when actual content starts (not ad),
// then unmutes and notifies React Native via postMessage.
// The loading overlay stays up during any pre-roll ad — users never see it.
function makeYouTubeInject(safeStart: number) {
  return `
(function() {
  var notified = false;

  // Poll: skip skippable ads + detect when real content is playing
  setInterval(function() {
    // Click skip / close buttons for skippable and overlay ads
    var skip = document.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-slot'
    );
    if (skip) { skip.click(); }
    var close = document.querySelector('.ytp-ad-overlay-close-button');
    if (close) { close.click(); }

    // Notify React Native once the actual trailer content is playing
    // (ad-showing class is present on <html> during any pre-roll ad)
    if (!notified && window.player &&
        typeof window.player.getPlayerState === 'function' &&
        window.player.getPlayerState() === 1 &&
        !document.documentElement.classList.contains('ad-showing')) {
      notified = true;
      window.player.unMute();
      window.player.setVolume(100);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cs_content_ready' }));
    }
  }, 300);
})();
true;
`;
}

export const TrailerPlayer = forwardRef<TrailerPlayerHandle, TrailerPlayerProps>(
  function TrailerPlayer({ movie, onEnded, onWindowCalculated }, ref) {
    const { width, height } = useWindowDimensions();
    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(true);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerStartRef = useRef<number>(0);
    const remainingRef = useRef<number>(0);
    const playerRef = useRef<any>(null);
    const skipEndTimerOnReady = useRef(false);
    const dynStartRef = useRef<number>(0);

    // Insane mode: safe_start is null until the window is dynamically calculated
    const insaneMode = movie.safe_start === null;
    const safeStart = movie.safe_start ?? 0;
    const safeEnd = movie.safe_end ?? (insaneMode ? 99999 : 60);
    const duration = insaneMode ? 30_000 : Math.max(safeEnd - safeStart, 10) * 1000;
    const youtubeInject = makeYouTubeInject(safeStart);

    function startEndTimer(ms: number = duration) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerStartRef.current = Date.now();
      remainingRef.current = ms;
      timerRef.current = setTimeout(() => {
        setPlaying(false);
        setLoading(true);
        onEnded?.();
      }, ms);
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
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        skipEndTimerOnReady.current = false;
        setPlaying(false);
        const replayStart = insaneMode ? dynStartRef.current : safeStart;
        setTimeout(() => {
          playerRef.current?.seekTo(replayStart, true);
          setPlaying(true);
          // Fallback in case cs_content_ready doesn't fire on replay
          fallbackRef.current = setTimeout(() => {
            setLoading(false);
            startEndTimer(insaneMode ? 30_000 : duration);
          }, 3000);
        }, 300);
      },
    }));

    // ── YouTube handlers ────────────────────────────────────────────────────
    async function handleYouTubeReady() {
      if (insaneMode) {
        // Dynamic windowing: seek to middle ±15 s after getting total duration
        skipEndTimerOnReady.current = true;
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        try {
          const totalSec: number = (await playerRef.current?.getDuration()) ?? 120;
          const mid = totalSec / 2;
          const dynStart = Math.max(0, mid - 15);
          const dynEnd = dynStart + 30;
          dynStartRef.current = dynStart;
          playerRef.current?.seekTo(dynStart, true);
          onWindowCalculated?.(dynStart, dynEnd);
        } catch (_) {
          // getDuration failed — play from position 0
          dynStartRef.current = 0;
        }
        // Show content and start 30 s timer after seek settles
        fallbackRef.current = setTimeout(() => {
          setLoading(false);
          startEndTimer(30_000);
        }, 2000);
      } else {
        playerRef.current?.seekTo(safeStart, true);
        // Fallback: show content after 3s if the inject message never arrives
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        fallbackRef.current = setTimeout(() => {
          setLoading(false);
          startEndTimer();
        }, 3000);
      }
    }

    function handleYouTubeStateChange(state: string) {
      // loading/timer are now driven by cs_content_ready from the inject —
      // only handle terminal states here.
      if (state === 'ended') {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        setLoading(true);
        onEnded?.();
      }
    }

    // Receives cs_content_ready from the inject once the actual trailer
    // content is confirmed playing (ad-showing class is gone).
    function handleWebViewMessage(event: { nativeEvent: { data: string } }) {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'cs_content_ready') {
          if (skipEndTimerOnReady.current) {
            // Insane mode: our own timer is running — just hide the loader
            setLoading(false);
          } else {
            // Normal mode: content confirmed, start timer
            if (fallbackRef.current) clearTimeout(fallbackRef.current);
            setLoading(false);
            startEndTimer();
          }
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
            height={height}
            width={width}
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
            <ActivityIndicator size="large" color="#f5c518" />
          </View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 10,
  },
});
