import React, { MutableRefObject, useEffect, useRef, useState } from 'react';
import { VisualMode } from '../types';
import { getVideoUrl } from '../utils/assetMap';
import { engine } from '../engine/PranaEngine';

interface VideoBackgroundProps {
  /** The pattern selected in Controls — loaded before the session starts. */
  patternId: string;
  visualMode: VisualMode;
  isNightMode: boolean;
  isPlaying: boolean;
  /** Reports whether the session video can play through without stalling. */
  onReadyChange: (ready: boolean) => void;
}

// Maximum allowed drift between the video frame and the engine's hardware
// clock before we snap currentTime back. Small enough to be invisible,
// large enough that we don't fight the video decoder every frame.
const MAX_DRIFT_SEC = 0.25;

// Minimum gap between corrective seeks. A seek on a mobile decoder can take
// longer than one frame; re-seeking before it lands restarts decoding from
// the nearest keyframe every frame, which shows as blur and can stall the
// main thread.
const SEEK_COOLDOWN_MS = 1000;

// Never hold the Start button longer than this. A slow connection gets a
// slightly rough start instead of a button that never enables.
const READY_TIMEOUT_MS = 12000;

// A day/night switch that isn't playing within this long blacks the layer
// out until it is, instead of showing a stuttering frame.
const SWITCH_BLACKOUT_DELAY_MS = 250;

const VIDEO = 'absolute inset-0 w-full h-full object-cover object-center pointer-events-none transition-opacity duration-300';

// Two layers:
//
//   idle    — the onboarding loop shown on the start panel
//   session — the selected pattern's video
//
// The session layer is the SAME <video> element before and during the
// session. It buffers invisibly while the user is on the start panel, so
// tapping "Enter Session" only fades it in. (A separate preloader element
// does not help: browsers keep ranged media downloads per element.)
export const VideoBackground: React.FC<VideoBackgroundProps> = ({
  patternId,
  visualMode,
  isNightMode,
  isPlaying,
  onReadyChange,
}) => {
  // The session layer's currently displayed element, for the sync loop.
  const sessionVideoRef = useRef<HTMLVideoElement | null>(null);

  const sessionDay   = getVideoUrl(visualMode, patternId, 'day');
  const sessionNight = getVideoUrl(visualMode, patternId, 'night');
  const idleDay      = getVideoUrl(visualMode, 'idle', 'day');
  const idleNight    = getVideoUrl(visualMode, 'idle', 'night');

  // Session start: rewind so the first frame matches the engine's t=0.
  useEffect(() => {
    const video = sessionVideoRef.current;
    if (isPlaying && video) video.currentTime = 0;
  }, [isPlaying]);

  // ── VIDEO ENSLAVEMENT ─────────────────────────────────────────────────────
  // The video does not keep its own time. Every animation frame we compute
  // where the video SHOULD be from the engine's hardware clock and snap it
  // back if it has drifted, so it stays locked to the chimes at minute 29
  // exactly as at second 1, and self-heals when the tab returns from the
  // background.
  //
  // The modulo runs on the PRESET's mathematical cycle duration (e.g. exactly
  // 10.0s for Resonance), never on video.duration: the encoded files are up
  // to ~33ms short of the cycle, and wrapping on the file length would drift
  // seconds against the chimes over a long session.
  useEffect(() => {
    if (!isPlaying) return;

    let frameId: number;
    let lastSeekAt = 0;

    const syncLoop = () => {
      const state = engine.getState();
      const video = sessionVideoRef.current;
      const now = performance.now();
      if (
        state && state.cycleDuration > 0 &&
        video && video.duration && isFinite(video.duration) &&
        !video.paused && !video.seeking && now - lastSeekAt >= SEEK_COOLDOWN_MS
      ) {
        const cycle = state.cycleDuration;
        const expected = state.elapsed % cycle;
        // Circular drift: the native `loop` wraps a few ms before `expected`
        // does; measuring the short way around the loop avoids a seek on
        // every wrap.
        const raw = Math.abs(expected - video.currentTime);
        const drift = Math.min(raw, cycle - raw);
        if (drift > MAX_DRIFT_SEC) {
          video.currentTime = Math.min(expected, video.duration - 0.001);
          lastSeekAt = now;
        }
      }
      frameId = requestAnimationFrame(syncLoop);
    };

    frameId = requestAnimationFrame(syncLoop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
      {/* Fallback, visible on its own when no video file loads. */}
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{
          background: isNightMode
            ? 'radial-gradient(ellipse at 50% 60%, #101a2b 0%, #05070c 70%)'
            : 'radial-gradient(ellipse at 50% 60%, #1d3a4a 0%, #070b10 70%)',
        }}
      />
      {/* Keyed by source: a new pattern or style remounts the layer, which
          resets its loading state cleanly. */}
      <DayNightLayer
        key={`idle|${idleDay}`}
        daySrc={idleDay} nightSrc={idleNight}
        isNight={isNightMode}
        visible={!isPlaying}
      />
      <DayNightLayer
        key={`session|${sessionDay}`}
        daySrc={sessionDay} nightSrc={sessionNight}
        isNight={isNightMode}
        visible={isPlaying}
        warm
        displayedRef={sessionVideoRef}
        onReadyChange={onReadyChange}
      />
    </div>
  );
};

interface DayNightLayerProps {
  daySrc: string;
  nightSrc: string;
  isNight: boolean;
  /** Shown on screen (and playing). */
  visible: boolean;
  /** Buffer the video while hidden so it is ready before it is shown. */
  warm?: boolean;
  /** Receives the element currently on screen. */
  displayedRef?: MutableRefObject<HTMLVideoElement | null>;
  onReadyChange?: (ready: boolean) => void;
}

// A day video and a night video for the same content, so the night-mode
// toggle is a swap rather than a fresh download. The mode on screen loads
// first; the other starts loading only once the first can play through, so
// it never competes with it for bandwidth. On a toggle the incoming video
// is started at the same position and swapped in once it is actually
// playing; if that takes longer than a moment, the layer blacks out rather
// than showing a stuttering frame.
const DayNightLayer: React.FC<DayNightLayerProps> = ({
  daySrc, nightSrc, isNight, visible, warm = false, displayedRef, onReadyChange,
}) => {
  const dayRef   = useRef<HTMLVideoElement>(null);
  const nightRef = useRef<HTMLVideoElement>(null);
  const el = (night: boolean) => (night ? nightRef.current : dayRef.current);

  // The mode actually on screen. Lags `isNight` while a switch is loading.
  const [shownNight, setShownNight]     = useState(isNight);
  const [primaryReady, setPrimaryReady] = useState(false);
  const [playing, setPlaying]           = useState({ day: false, night: false });
  const [failed, setFailed]             = useState({ day: false, night: false });
  const [switching, setSwitching]       = useState(false);

  const shownKey = shownNight ? 'night' : 'day';
  const shouldPlay = visible || (warm && !primaryReady);

  useEffect(() => {
    if (displayedRef) displayedRef.current = el(shownNight);
  });

  // First load of the on-screen mode. Errors and a timeout count as ready so
  // the Start button can never get stuck.
  useEffect(() => {
    const video = el(shownNight);
    if (!video) return;
    onReadyChange?.(false);

    let done = false;
    const ready = () => {
      if (done) return;
      done = true;
      setPrimaryReady(true);
      onReadyChange?.(true);
    };
    video.addEventListener('canplaythrough', ready);
    video.addEventListener('error', ready);
    const timeout = window.setTimeout(ready, READY_TIMEOUT_MS);
    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) ready();

    return () => {
      done = true;
      clearTimeout(timeout);
      video.removeEventListener('canplaythrough', ready);
      video.removeEventListener('error', ready);
    };
    // Mount only: the layer is remounted when its sources change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play the on-screen element when needed; keep the other paused. Mobile
  // browsers ignore preload="auto", so a muted inline play() (allowed
  // without a gesture) is what forces the hidden session video to buffer.
  useEffect(() => {
    const shown = el(shownNight);
    const other = el(!shownNight);
    if (shouldPlay) shown?.play().catch(() => {});
    else shown?.pause();
    if (!switching) other?.pause();
  }, [shouldPlay, shownNight, switching]);

  // Day/night toggle.
  useEffect(() => {
    if (isNight === shownNight) return;
    const target = el(isNight);
    const current = el(shownNight);

    if (!shouldPlay || !target || failed[isNight ? 'night' : 'day']) {
      setShownNight(isNight);
      return;
    }

    let cancelled = false;
    const blackout = window.setTimeout(() => { if (!cancelled) setSwitching(true); }, SWITCH_BLACKOUT_DELAY_MS);
    const done = () => {
      if (cancelled) return;
      clearTimeout(blackout);
      setShownNight(isNight);
      setSwitching(false);
    };

    // Both files share a timeline, so continue from the same point.
    if (current && target.readyState >= HTMLMediaElement.HAVE_METADATA) {
      target.currentTime = current.currentTime;
    }
    target.play().then(done, done);

    return () => {
      cancelled = true;
      clearTimeout(blackout);
    };
  }, [isNight, shownNight, shouldPlay]);

  const onPlaying = (key: 'day' | 'night') => () => setPlaying(p => ({ ...p, [key]: true }));
  const onStalled = (key: 'day' | 'night') => () => setPlaying(p => ({ ...p, [key]: false }));
  const onError   = (key: 'day' | 'night') => () => setFailed(f => ({ ...f, [key]: true }));

  // Black while the on-screen video is loading, stalled or mid-switch. A
  // missing file shows the gradient fallback instead.
  const blackout = visible && !failed[shownKey] && (!playing[shownKey] || switching);

  // The mode not on screen loads only once the on-screen one is ready.
  const srcFor = (night: boolean) =>
    night === shownNight || primaryReady ? (night ? nightSrc : daySrc) : undefined;

  const videoProps = (key: 'day' | 'night') => ({
    loop: true, muted: true, playsInline: true, preload: 'auto' as const,
    onPlaying: onPlaying(key),
    onWaiting: onStalled(key),
    onPause: onStalled(key),
    onError: onError(key),
    className: `${VIDEO} ${visible && shownKey === key && !failed[key] ? 'opacity-100' : 'opacity-0'}`,
  });

  return (
    <>
      <video ref={dayRef} src={srcFor(false)} {...videoProps('day')} />
      <video ref={nightRef} src={srcFor(true)} {...videoProps('night')} />
      <div
        className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-300 ${blackout ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  );
};
