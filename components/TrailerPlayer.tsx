import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Movie } from '@/lib/database.types';

const log = __DEV__ ? console.log : () => {};

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
  onPlaying?: () => void;
}

export const TITLE_CARD_BURN = 4000; // ms after video starts playing before revealing the content

function makeYouTubeInject(unmuteAtMs: number | null, endMuteAtVideoSec: number | null) {
  const unmuteDelayExpr = unmuteAtMs != null
    ? `Math.max(0, ${unmuteAtMs} - Date.now())`
    : '300';

  return `
if (!window.ReactNativeWebView) { window.ReactNativeWebView = { postMessage: function() {} }; }
(function() {
  var _oe = window.onerror;
  window.onerror = function(msg, src, line, col, err) {
    if (typeof msg === 'string' && (msg.indexOf('getCurrentTime') !== -1 || msg.indexOf('postMessage') !== -1)) return true;
    return _oe ? _oe(msg, src, line, col, err) : false;
  };
})();
(function() {
  var muted = false;
  var unmuted = false;
  var endMuted = false;
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
      }, ${unmuteDelayExpr});
    }

    ${endMuteAtVideoSec != null ? `
    // End-mute is keyed off video time (not wall clock) so load/seek delay can't
    // throw it off — it always fires at the same point in the trailer playback.
    if (!endMuted && unmuted && typeof window.player.getCurrentTime === 'function') {
      try {
        var t = window.player.getCurrentTime();
        if (typeof t === 'number' && t >= ${endMuteAtVideoSec}) {
          endMuted = true;
          if (typeof window.player.mute === 'function') { window.player.mute(); }
        }
      } catch (e) {}
    }` : ''}
  }, 100);
})();
true;
`;
}

// ── TrailerPlayer ─────────────────────────────────────────────────────────────

export const TrailerPlayer = forwardRef<TrailerPlayerHandle, TrailerPlayerProps>(
  function TrailerPlayer({ movie, onEnded, onRevealed, onWindowCalculated, unmuteAfterMs, onPlaying }, ref) {
    const { width, height } = useWindowDimensions();

    const ratio    = 16 / 9;
    const byWidth  = { w: width,                     h: Math.round(width / ratio)   };
    const byHeight = { w: Math.round(height * ratio), h: height                     };
    const playerW  = byWidth.h <= height ? byWidth.w : byHeight.w;
    const playerH  = byWidth.h <= height ? byWidth.h : byHeight.h;

    const [playing, setPlaying]       = useState(true);
    const [endOverlay, setEndOverlay] = useState(false);

    const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
    const overlayTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerStartRef       = useRef<number>(0);
    const remainingRef        = useRef<number>(0);
    const playerRef           = useRef<any>(null);
    const skipEndTimerOnReady = useRef(false);
    const dynStartRef         = useRef<number>(0);
    // Dynamic-window end (video-time seconds). Set in handleYouTubeReady once we know
    // the trailer duration; the tick uses this to actively stop playback.
    const dynEndRef           = useRef<number>(0);

    const videoPlayingRef  = useRef(false);
    const seekToTimeRef    = useRef(0);
    // Playback probe: watches the playhead advance to detect REAL playback,
    // covering both a missed 'playing' state event and slow networks where
    // 'ready' fires long before frames actually roll. The reveal is gated
    // exclusively on confirmed playback — a non-playing player shows the
    // video title (cued thumbnail / title overlay), which spoils the game.
    const probeRef         = useRef<ReturnType<typeof setInterval> | null>(null);
    const probeLastTimeRef = useRef<number | null>(null);

    // T0 = mount time; all [CS] timestamps are ms relative to this.
    const t0Ref = useRef(Date.now());
    const ms = () => Date.now() - t0Ref.current;

    // True when this movie has no scanned safe window (typical for fresh insane-mode TMDb
    // pulls), so we fall back to the dynamic midpoint ±15s heuristic. Independent of game
    // mode — an insane-mode game can still hit this branch off a previously-scanned movie.
    const useDynamicWindow = movie.safe_start === null;
    const safeStart  = movie.safe_start ?? 0;
    const rawSafeEnd = movie.safe_end ?? (useDynamicWindow ? 99999 : 60);
    // Cut a couple of seconds off the safe window to stop cleanly before the video ends.
    // Falls back to a 10s minimum so we don't shave a too-short window to nothing.
    const END_TRIM_SEC = 2;
    const safeEnd      = useDynamicWindow ? rawSafeEnd : Math.max(rawSafeEnd - END_TRIM_SEC, safeStart + 10);
    const duration     = useDynamicWindow ? 40_000 : Math.max(safeEnd - safeStart, 10) * 1000;

    // Injection captured at mount so Date.now() reflects the actual mount time.
    // End-mute uses video-time (seconds), aligned ~0.5s before our active end-trigger
    // so audio fades out just before the screen switches.
    const [youtubeInject] = useState(() => {
      const now = Date.now();
      return makeYouTubeInject(
        unmuteAfterMs != null ? now + unmuteAfterMs : null,
        useDynamicWindow ? null : safeEnd - 0.8,
      );
    });

    useEffect(() => {
    }, []);

    // Active end-trigger: poll the video's playhead and stop ourselves before YouTube's
    // own `ended` event fires. Scanned movies use safeEnd; dynamic-window movies use the
    // dynEnd computed in handleYouTubeReady (midpoint + 15s, capped to total length).
    const activeEndFiredRef = useRef(false);
    useEffect(() => {
      const id = setInterval(async () => {
        try {
          const t = await playerRef.current?.getCurrentTime?.();
          if (typeof t !== 'number') return;
          // Resolve the end target each tick — dynEnd is set asynchronously after the
          // player reports duration, so it may not be ready on the first ticks.
          const targetEnd = useDynamicWindow ? dynEndRef.current : safeEnd;
          if (!activeEndFiredRef.current && targetEnd > 0 && t >= targetEnd - 0.3) {
            activeEndFiredRef.current = true;
            log(`[CS] active end fired      t=${ms()}  videoTime=${t.toFixed(2)}s  → onEnded()`);
            if (timerRef.current)        clearTimeout(timerRef.current);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            if (fallbackRef.current)     clearTimeout(fallbackRef.current);
            setEndOverlay(true);
            setPlaying(false);
            onEnded?.();
          }
        } catch (_) {}
      }, 250);
      return () => clearInterval(id);
    }, [safeEnd, useDynamicWindow]);

    function startEndTimer(ms_: number = duration) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      timerStartRef.current = Date.now();
      remainingRef.current  = ms_;
      // Switch screens slightly before the safe end for a clean transition.
      // Black overlay fires at the same instant as a safety net in case onEnded is debounced upstream.
      const switchAt = Math.max(ms_ - 1000, 0);
      overlayTimerRef.current = setTimeout(() => {
        setEndOverlay(true);
      }, switchAt);
      timerRef.current = setTimeout(() => {
        log(`[CS] JS endTimer fired      t=${ms()}  → onEnded()`);
        setPlaying(false);
        onEnded?.();
      }, switchAt);
    }

    function doReveal() {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      onRevealed?.();
      if (!skipEndTimerOnReady.current) {
        startEndTimer(Math.max(duration - 200, 1000));
      }
    }

    function stopPlaybackProbe() {
      if (probeRef.current) { clearInterval(probeRef.current); probeRef.current = null; }
      probeLastTimeRef.current = null;
    }

    function startPlaybackProbe() {
      stopPlaybackProbe();
      probeRef.current = setInterval(async () => {
        try {
          const t = await playerRef.current?.getCurrentTime?.();
          if (typeof t !== 'number') return;
          const last = probeLastTimeRef.current;
          probeLastTimeRef.current = t;
          if (last == null) return;
          const delta = t - last;
          // Real playback advances ~0.5s per tick. A large jump is a seek
          // (to safeStart/dynStart) landing while still paused/buffering —
          // record the new baseline but don't mistake it for playback.
          if (delta > 0.2 && delta < 2) markPlaying();
        } catch {}
      }, 500);
    }

    // The single authority on "playback is really happening": notifies the game
    // and starts the title-card burn from THIS moment. Nothing else reveals.
    function markPlaying() {
      if (videoPlayingRef.current) return;
      videoPlayingRef.current = true;
      stopPlaybackProbe();
      log(`[CS] playback confirmed    t=${ms()}  → burn ${TITLE_CARD_BURN}ms`);
      onPlaying?.();
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(() => doReveal(), TITLE_CARD_BURN);
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
        stopPlaybackProbe();
        setPlaying(false);
      },
      replay() {
        videoPlayingRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        skipEndTimerOnReady.current = false;
        setEndOverlay(false);
        setPlaying(false);
        const replayStart = useDynamicWindow ? dynStartRef.current : safeStart;
        setTimeout(() => {
          playerRef.current?.seekTo(replayStart, true);
          setPlaying(true);
          // Same invariant as first play: the probe (or 'playing' event)
          // confirms playback, then the burn reveals — never a blind timer.
          startPlaybackProbe();
        }, 300);
      },
    }));

    async function handleYouTubeReady() {
      // Ready ≠ playing: the player frame is loaded, but on a slow connection
      // frames may not roll for many seconds yet. Start the playhead probe —
      // markPlaying (via probe or 'playing' event) is the only reveal trigger,
      // so the cover can never lift onto a non-playing player.
      startPlaybackProbe();
      if (useDynamicWindow) {
        skipEndTimerOnReady.current = true;
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        try {
          const totalSec: number = (await playerRef.current?.getDuration()) ?? 120;
          const mid      = totalSec / 2;
          const dynStart = Math.max(0, mid - 20);
          const dynEnd   = Math.min(dynStart + 40, totalSec - 0.5); // never overshoot the natural end
          dynStartRef.current = dynStart;
          dynEndRef.current   = dynEnd;
          playerRef.current?.seekTo(dynStart, true);
          onWindowCalculated?.(dynStart, dynEnd);
        } catch (_) {
          dynStartRef.current = 0;
          dynEndRef.current   = 40; // fallback: cap at 40s of video time
        }
      } else {
        seekToTimeRef.current = Date.now();
        playerRef.current?.seekTo(safeStart, true);
      }
    }

    function handleYouTubeStateChange(state: string) {
      if (state === 'playing') {
        markPlaying();
      }
      if (state === 'ended') {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        stopPlaybackProbe();
        onEnded?.();
      }
    }

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        if (probeRef.current) clearInterval(probeRef.current);
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
              allowsProtectedMedia: false,
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
