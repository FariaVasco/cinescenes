import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { WebView } from 'react-native-webview';
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
}

// Unmutes the YouTube player after it starts (IFrame API starts muted by policy)
// and auto-clicks the skip-ad button whenever it appears.
const YOUTUBE_INJECT = `
(function() {
  // Unmute once playing
  var unmutePoll = setInterval(function() {
    if (window.player && typeof window.player.getPlayerState === 'function') {
      if (window.player.getPlayerState() === 1) {
        window.player.unMute();
        window.player.setVolume(100);
        clearInterval(unmutePoll);
      }
    }
  }, 200);

  // Auto-skip ads
  setInterval(function() {
    var skip = document.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-slot'
    );
    if (skip) { skip.click(); return; }
    // Close non-skippable overlay ads
    var close = document.querySelector('.ytp-ad-overlay-close-button');
    if (close) close.click();
  }, 300);
})();
true;
`;

export const TrailerPlayer = forwardRef<TrailerPlayerHandle, TrailerPlayerProps>(
  function TrailerPlayer({ movie, onEnded }, ref) {
    const { width, height } = useWindowDimensions();
    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(true);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerStartRef = useRef<number>(0);
    const remainingRef = useRef<number>(0);
    const playerRef = useRef<any>(null);

    const safeStart = movie.safe_start ?? 0;
    const safeEnd = movie.safe_end ?? 60;
    const duration = Math.max(safeEnd - safeStart, 10) * 1000;

    // Prefer Vimeo (no ads); fall back to YouTube
    const useVimeo = !!movie.vimeo_id;

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
        setPlaying(false);
        setTimeout(() => {
          if (!useVimeo) playerRef.current?.seekTo(safeStart, true);
          setPlaying(true);
          fallbackRef.current = setTimeout(() => setLoading(false), 5000);
        }, 300);
      },
    }));

    // ── YouTube handlers ────────────────────────────────────────────────────
    function handleYouTubeReady() {
      playerRef.current?.seekTo(safeStart, true);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(() => setLoading(false), 5000);
    }

    function handleYouTubeStateChange(state: string) {
      if (state === 'playing') {
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        setLoading(false);
        startEndTimer();
      }
      if (state === 'ended') {
        if (timerRef.current) clearTimeout(timerRef.current);
        setLoading(true);
        onEnded?.();
      }
    }

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
      };
    }, []);

    // ── Vimeo embed URL ─────────────────────────────────────────────────────
    // #t=Xs seeks to safeStart; autoplay=1 starts immediately.
    const vimeoUrl = `https://player.vimeo.com/video/${movie.vimeo_id}`
      + `?autoplay=1&muted=0&title=0&byline=0&portrait=0&controls=0`
      + `#t=${safeStart}s`;

    return (
      <View style={styles.container}>

        {useVimeo ? (
          <WebView
            source={{ uri: vimeoUrl }}
            style={{ width, height }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onLoadEnd={() => {
              setLoading(false);
              startEndTimer();
            }}
          />
        ) : (
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
              injectedJavaScript: YOUTUBE_INJECT,
            }}
          />
        )}

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
