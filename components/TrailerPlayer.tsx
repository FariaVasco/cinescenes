import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Movie } from '@/lib/database.types';

export interface TrailerPlayerHandle {
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
    const playerRef = useRef<any>(null);

    const safeStart = movie.safe_start ?? 0;
    const safeEnd = movie.safe_end ?? 60;
    const duration = Math.max(safeEnd - safeStart, 10) * 1000;

    function startEndTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPlaying(false);
        onEnded?.();
      }, duration);
    }

    useImperativeHandle(ref, () => ({
      replay() {
        setLoading(true); // black overlay covers YouTube UI during seek
        setPlaying(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        setTimeout(() => {
          playerRef.current?.seekTo(safeStart, true);
          setPlaying(true);
        }, 100);
      },
    }));

    function handleReady() {
      setLoading(false);
    }

    function handleChangeState(state: string) {
      if (state === 'playing') {
        setLoading(false);
        startEndTimer();
      }
      if (state === 'ended') {
        if (timerRef.current) clearTimeout(timerRef.current);
        onEnded?.();
      }
    }

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    return (
      <View style={styles.container}>
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#f5c518" />
          </View>
        )}
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
