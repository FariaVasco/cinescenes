import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
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
  onRevealed?: () => void;
  onWindowCalculated?: (start: number, end: number) => void;
  // Duration from mount until audio unmutes. Baked into the injection as an
  // absolute timestamp so the WebView fires at the right wall-clock moment.
  unmuteAfterMs?: number;
}

const TITLE_CARD_BURN = 3500; // ms after player ready before the YouTube title overlay is gone

function makeYouTubeInject(unmuteAtMs: number | null, endMuteAtMs: number | null) {
  const unmuteDelayExpr = unmuteAtMs != null
    ? `Math.max(0, ${unmuteAtMs} - Date.now())`
    : '300';
  const endMuteDelayExpr = endMuteAtMs != null
    ? `Math.max(0, ${endMuteAtMs} - Date.now())`
    : null;

  return `
(function() {
  var muted = false;
  var unmuted = false;
  var endMuteScheduled = false;
  var playerReadyAt = 0;

  setInterval(function() {
    var skip = document.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-slot'
    );
    if (skip) { skip.click(); }
    var close = document.querySelector('.ytp-ad-overlay-close-button');
    if (close) { close.click(); }

    if (!window.player) return;

    if (!playerReadyAt) {
      playerReadyAt = Date.now();
    }

    if (!muted && typeof window.player.mute === 'function') {
      window.player.mute();
      muted = true;
    }

    if (!unmuted && Date.now() - playerReadyAt >= ${TITLE_CARD_BURN}) {
      unmuted = true;
      setTimeout(function() {
        if (typeof window.player.unMute === 'function') {
          window.player.unMute();
          window.player.setVolume(100);
        }
        ${endMuteDelayExpr != null ? `
        if (!endMuteScheduled) {
          endMuteScheduled = true;
          setTimeout(function() {
            if (typeof window.player.mute === 'function') { window.player.mute(); }
          }, ${endMuteDelayExpr});
        }` : ''}
      }, ${unmuteDelayExpr});
    }
  }, 100);
})();
true;
`;
}

// ── TrailerPlayer ─────────────────────────────────────────────────────────────

export const TrailerPlayer = forwardRef<TrailerPlayerHandle, TrailerPlayerProps>(
  function TrailerPlayer({ movie, onEnded, onRevealed, onWindowCalculated, unmuteAfterMs }, ref) {
    const { width, height } = useWindowDimensions();

    const ratio    = 16 / 9;
    const byWidth  = { w: width,                     h: Math.round(width / ratio)   };
    const byHeight = { w: Math.round(height * ratio), h: height                     };
    const playerW  = byWidth.h <= height ? byWidth.w : byHeight.w;
    const playerH  = byWidth.h <= height ? byWidth.h : byHeight.h;

    const [playing, setPlaying]         = useState(true);
    const [endOverlay, setEndOverlay]   = useState(false);

    const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
    const overlayTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerStartRef       = useRef<number>(0);
    const remainingRef        = useRef<number>(0);
    const playerRef           = useRef<any>(null);
    const skipEndTimerOnReady = useRef(false);
    const dynStartRef         = useRef<number>(0);

    const contentReadyRef = useRef(false);
    const seekToTimeRef   = useRef(0);

    // T0 = mount time; all [CS] timestamps are ms relative to this.
    const t0Ref = useRef(Date.now());
    const ms = () => Date.now() - t0Ref.current;

    const insaneMode = movie.safe_start === null;
    const safeStart  = movie.safe_start ?? 0;
    const safeEnd    = movie.safe_end ?? (insaneMode ? 99999 : 60);
    const duration   = insaneMode ? 30_000 : Math.max(safeEnd - safeStart, 10) * 1000;

    // Injection captured at mount so Date.now() reflects the actual mount time.
    const [youtubeInject] = useState(() => {
      const now = Date.now();
      return makeYouTubeInject(
        unmuteAfterMs != null ? now + unmuteAfterMs : null,
        now + duration - 800,  // mute audio 800ms before clip end
      );
    });

    useEffect(() => {
      console.log(`[CS] TrailerPlayer mounted  t=0  unmuteAfterMs=${unmuteAfterMs}  TITLE_CARD_BURN=${TITLE_CARD_BURN}`);
    }, []);

    function startEndTimer(ms_: number = duration) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      timerStartRef.current = Date.now();
      remainingRef.current  = ms_;
      // Black overlay appears 1s before screen switch, hiding any YouTube end card.
      overlayTimerRef.current = setTimeout(() => setEndOverlay(true), Math.max(ms_ - 1000, 0));
      timerRef.current = setTimeout(() => {
        setPlaying(false);
        onEnded?.();
      }, ms_);
    }

    function doReveal() {
      console.log(`[CS] doReveal              t=${ms()}`);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      onRevealed?.();
      if (!skipEndTimerOnReady.current) {
        startEndTimer(Math.max(duration - 200, 1000));
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
      },
      replay() {
        contentReadyRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        skipEndTimerOnReady.current = false;
        setEndOverlay(false);
        setPlaying(false);
        const replayStart = insaneMode ? dynStartRef.current : safeStart;
        setTimeout(() => {
          playerRef.current?.seekTo(replayStart, true);
          setPlaying(true);
          fallbackRef.current = setTimeout(() => {
            doReveal();
          }, TITLE_CARD_BURN + 1000);
        }, 300);
      },
    }));

    async function handleYouTubeReady() {
      console.log(`[CS] YouTube player ready  t=${ms()}`);
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
        console.log(`[CS] burn timer set        t=${ms()}  fires in ${TITLE_CARD_BURN}ms`);
        fallbackRef.current = setTimeout(() => {
          console.log(`[CS] burn timer fired      t=${ms()}`);
          if (!contentReadyRef.current) doReveal();
        }, TITLE_CARD_BURN);
      } else {
        seekToTimeRef.current = Date.now();
        playerRef.current?.seekTo(safeStart, true);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        console.log(`[CS] burn timer set        t=${ms()}  fires in ${TITLE_CARD_BURN}ms`);
        fallbackRef.current = setTimeout(() => {
          console.log(`[CS] burn timer fired      t=${ms()}`);
          if (!contentReadyRef.current) doReveal();
        }, TITLE_CARD_BURN);
      }
    }

    function handleYouTubeStateChange(state: string) {
      console.log(`[CS] YouTube state change  t=${ms()}  state=${state}`);
      if (state === 'ended') {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        onEnded?.();
      }
    }

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
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
            }}
          />
        {endOverlay && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
        )}
      </View>
    );
  }
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
