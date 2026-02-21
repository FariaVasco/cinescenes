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
}

const UNMUTE_SCRIPT = `
(function() {
  var poll = setInterval(function() {
    if (window.player && typeof window.player.getPlayerState === 'function') {
      var state = window.player.getPlayerState();
      if (state === 1) {
        window.player.unMute();
        window.player.setVolume(100);
        clearInterval(poll);
      }
    }
  }, 200);
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
          playerRef.current?.seekTo(safeStart, true);
          setPlaying(true);
          fallbackRef.current = setTimeout(() => setLoading(false), 5000);
        }, 300);
      },
    }));

    function handleReady() {
      playerRef.current?.seekTo(safeStart, true);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(() => setLoading(false), 5000);
    }

    function handleChangeState(state: string) {
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
          onReady={handleReady}
          onChangeState={handleChangeState}
          webViewProps={{
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            injectedJavaScript: UNMUTE_SCRIPT,
          }}
        />
        {/* Rendered after YoutubePlayer so it sits above it */}
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
