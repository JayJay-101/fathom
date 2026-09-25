import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNightMode } from './hooks/useNightMode';
import { useBreathEngine } from './hooks/useBreathEngine';
import { engine } from './engine/PranaEngine';
import { VideoBackground } from './components/VideoBackground';
import { AudioSession } from './components/AudioSession';
import { Controls } from './components/Controls';
import { BreathTimer } from './components/BreathTimer';
import { VisualMode, AudioOutputMode, BreathPattern } from './types';
import { PATTERNS } from './data/presets';
import { InfoModal } from './components/InfoModal';
import { IconButton } from './components/IconButton';
import { OffboardingModal } from './components/OffboardingModal';
import { OnboardingPage } from './pages/OnboardingPage';
import { Tour } from './components/Tour';
import { getPatternDurationMs } from './data/assetManifest';
import { summarizeSession, formatClock } from './session/summary';
import { postSessionLog, fetchMe, fetchStats, fetchAchievements, patchMe, AchievementDefinition, UserStats } from './storage';
import {
  RotateCcw, Volume2, VolumeX,
  Infinity as InfinityIcon, Moon, Sun, Info,
  Headphones, Speaker, Bell, BellOff, Maximize, Minimize,
} from 'lucide-react';

// Mirrors the `phase` colors in tailwind.config.js — kept as plain values
// here since inline styles (phaseColor drives textShadow) can't reference
// Tailwind classes.
const PHASE_COLORS = {
  inhale: '#22d3ee',
  exhale: '#c084fc',
  hold: '#64748b',
};

const PHASE_META = {
  idle:       { label: 'Ready',   instruction: '' },
  inhale:     { label: 'Inhale',  instruction: 'Expand Awareness' },
  'hold-in':  { label: 'Hold',    instruction: 'Observe Stillness' },
  exhale:     { label: 'Exhale',  instruction: 'Release Tension' },
  'hold-out': { label: 'Empty',   instruction: 'Embrace Void' },
};

export default function App() {
  const { isNightMode, toggleNightMode } = useNightMode();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBedMuted, setIsBedMuted] = useState(false);
  const [isChimesEnabled, setIsChimesEnabled] = useState(true);
  const [showOffboarding, setShowOffboarding] = useState(false);
  const [newlyEarned, setNewlyEarned] = useState<string[]>([]);
  const [showFirstCyclePill, setShowFirstCyclePill] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [sessionStats, setSessionStats] = useState<UserStats | null>(null);
  const [achievementDefs, setAchievementDefs] = useState<Record<string, AchievementDefinition>>({});
  const [finalStats, setFinalStats] = useState({ minutes: 0, cycles: 0 });
  const [showChimeNudge, setShowChimeNudge] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<BreathPattern>(PATTERNS[2]);
  const [visualMode, setVisualMode] = useState<VisualMode>('geometry');
  const [audioMode, setAudioMode] = useState<AudioOutputMode>('earphones');
  const [uiVisible, setUiVisible] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const handleVideoReady = useCallback((ready: boolean) => setIsVideoReady(ready), []);

  // Locked at "Enter Session" — AudioSession reads this ref for the full
  // session lifetime so the bed track URL never changes mid-session.
  const lockedAudioModeRef = useRef<AudioOutputMode>(audioMode);

  // Session lifecycle refs
  const sessionStartTimeRef = useRef<number | null>(null); // wall clock, for the session log only
  const sessionIdRef        = useRef<string | null>(null);
  const sleepNudgeFiredRef  = useRef(false);

  // Warm the chime buffers + AudioContext on mount so the very first
  // session's t=0 chime is already decoded and ready.
  useEffect(() => { engine.preloadChimes(); }, []);

  // First-run onboarding — local state, not a guarded route. null means the
  // profile hasn't been read yet, so neither screen renders (one frame).
  useEffect(() => {
    fetchMe().then(p => {
      setNeedsOnboarding(!p.onboarding_completed);
      if (p.visual_mode) setVisualMode(p.visual_mode as VisualMode);
      if (p.audio_mode) setAudioMode(p.audio_mode as AudioOutputMode);
      setIsChimesEnabled(p.chimes_enabled);
      // First visit after onboarding: offer the guided tour once.
      if (p.onboarding_completed && !p.tutorial_completed) setShowTour(true);
    });
  }, []);

  // Persist the preferences the profile carries, so the next visit opens
  // where the last one left off.
  useEffect(() => {
    if (needsOnboarding !== false) return;
    patchMe({ visual_mode: visualMode, audio_mode: audioMode, chimes_enabled: isChimesEnabled });
  }, [visualMode, audioMode, isChimesEnabled, needsOnboarding]);

  // ── FULLSCREEN ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // Dedicated fullscreen toggle — mobile browsers intercept double-tap for
  // viewport zoom, so fullscreen and session start each get their own
  // single-tap target instead of overloading document-level double-click.
  const handleToggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  // ── BREATH ENGINE (React is a slave renderer of the hardware clock) ───────
  const activePatternId = isPlaying ? selectedPattern.id : 'idle';
  const { currentPhase, phaseDuration, remainingSeconds, cycles, elapsed } =
    useBreathEngine(isPlaying);

  // Chime toggle routes straight to the engine's gain node — instant, and it
  // silences even chimes already handed to the hardware timeline.
  useEffect(() => { engine.setChimesEnabled(isChimesEnabled); }, [isChimesEnabled]);

  // ── UI AUTO-HIDE ───────────────────────────────────────────────────────────
  useEffect(() => {
    let timeout: number;
    if (isPlaying && uiVisible) {
      timeout = window.setTimeout(() => setUiVisible(false), 3141);
    }
    return () => clearTimeout(timeout);
  }, [isPlaying, uiVisible]);

  // ── STATS FETCHER ─────────────────────────────────────────────────────────
  // Stats re-fetch whenever the user returns to the pre-session Controls
  // panel (fresh numbers after a completed session). Achievement definitions
  // are static, so they're fetched once per app load — the ref guard also
  // absorbs StrictMode's dev-only double effect invocation.
  const achievementsFetchedRef = useRef(false);
  useEffect(() => {
    if (!isPlaying && !showOffboarding) {
      fetchStats().then(setSessionStats);
      if (!achievementsFetchedRef.current) {
        achievementsFetchedRef.current = true;
        fetchAchievements().then(res => {
          if (!res) return;
          const byId: Record<string, AchievementDefinition> = {};
          for (const def of res.definitions) byId[def.id] = def;
          setAchievementDefs(byId);
        });
      }
    }
  }, [isPlaying, showOffboarding]);

  // ── SLEEP AUTO-CHIME NUDGE (UI only) ─────────────────────────────────────
  // The actual 5-minute chime cutoff is enforced inside the engine's
  // scheduler on the hardware clock — this effect only syncs the bell icon
  // and shows the nudge pill once the UI observes the cutoff has passed.
  useEffect(() => {
    if (!isPlaying || selectedPattern.id !== 'sleep') return;
    if (elapsed >= 5 * 60 && !sleepNudgeFiredRef.current) {
      sleepNudgeFiredRef.current = true;
      setIsChimesEnabled(false);
      setShowChimeNudge(true);
      setTimeout(() => setShowChimeNudge(false), 2000);
    }
  }, [elapsed, isPlaying, selectedPattern.id]);

  // ── HANDLERS ───────────────────────────────────────────────────────────────

  // Shared by both session-end paths (auto-complete and manual stop) so a
  // session is always logged exactly once, however it ends.
  const logSessionEnd = async (endReason: 'completed' | 'user_stopped', engineCycles: number) => {
    const startedAt = sessionStartTimeRef.current;
    if (!startedAt) return; // nothing to log — session never really started

    const endedAt = Date.now();
    const summary = summarizeSession({
      pattern: selectedPattern,
      startedAtMs: startedAt,
      endedAtMs: endedAt,
      targetMs: getPatternDurationMs(selectedPattern.id),
      engineCycles,
    });
    if (!summary) return; // too short to count

    setFinalStats({ minutes: summary.durationMinutes, cycles: summary.cycles });

    const bedType = lockedAudioModeRef.current === 'speaker' ? 'isochronic' : 'binaural';

    const sessionResult = await postSessionLog({
      client_recorded_at:        new Date(endedAt).toISOString(),
      started_at:                new Date(startedAt).toISOString(),
      ended_at:                  new Date(endedAt).toISOString(),
      duration_minutes:          summary.durationMinutes,
      pattern_id:                selectedPattern.id,
      visual_mode:               visualMode,
      audio_mode:                bedType,
      cycles_completed:          summary.cycles,
      max_session_depth_reached: null,
      end_reason:                endReason,
      is_backdated:              false,
      review_rating:             null,
      review_text:               null,
    });

    if (sessionResult.session_id) {
      sessionIdRef.current = sessionResult.session_id;
      setNewlyEarned(sessionResult.newly_earned ?? []);
    }
  };

  // Called by the engine's heartbeat when elapsed >= session duration —
  // checked against the hardware clock, so it fires on time even when the
  // tab is hidden (unlike the old setTimeout, which browsers throttle).
  const handleSessionComplete = async () => {
    const engineCycles = engine.getState()?.cycles ?? 0; // read before stopping
    engine.stop();
    setIsPlaying(false);
    setShowOffboarding(true);
    await logSessionEnd('completed', engineCycles);
  };

  const handleStart = async () => {
    // Guards against the double-tap gesture and a stray click both firing
    // handleStart, and gives the button instant visual feedback the moment
    // it's tapped.
    if (isStarting || !isVideoReady) return;
    setIsStarting(true);

    try {
      // Sessions start immediately — there is no quota to check and no key
      // to obtain. The try/finally only exists to clear the tap guard.
      lockedAudioModeRef.current = audioMode; // lock mode for this session
      sessionStartTimeRef.current = Date.now();
      sleepNudgeFiredRef.current = false;

      // Start the master clock — inside the user gesture, which wakes the
      // AudioContext and lets the engine schedule the t=0 chime immediately.
      // Session completion and the sleep chime cutoff are both enforced by
      // the engine on the hardware clock; no throttleable timers remain.
      engine.start(selectedPattern, getPatternDurationMs(selectedPattern.id), {
        chimesEnabled: isChimesEnabled,
        chimeCutoffSec: selectedPattern.id === 'sleep' ? 5 * 60 : null,
        onComplete: handleSessionComplete,
      });

      setIsPlaying(true);
      setUiVisible(false);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const engineCycles = engine.getState()?.cycles ?? 0; // read before stopping
    engine.stop();
    setIsPlaying(false);
    setUiVisible(true);
    // audioMode state is free again — user can switch before next session

    // Log the partial session before clearing sessionStartTimeRef — logSessionEnd
    // reads it to compute elapsed time.
    logSessionEnd('user_stopped', engineCycles).finally(() => {
      sessionStartTimeRef.current = null;
    });
  };

  const handleScreenClick = () => {
    if (isPlaying) setUiVisible(prev => !prev);
  };

  // ── FIRST-CYCLE ACHIEVEMENT PILL ──────────────────────────────────────────
  useEffect(() => {
    if (cycles === 1 && isPlaying) {
      setShowFirstCyclePill(true);
      const t = setTimeout(() => setShowFirstCyclePill(false), 3000);
      return () => clearTimeout(t);
    }
  }, [cycles, isPlaying]);

  const phaseColor =
    currentPhase === 'inhale'   ? PHASE_COLORS.inhale :
    currentPhase === 'exhale'   ? PHASE_COLORS.exhale :
    currentPhase === 'hold-out' ? PHASE_COLORS.hold :
    'rgba(255,255,255,0.4)';

  if (needsOnboarding === null) return null;
  if (needsOnboarding) {
    return <OnboardingPage onComplete={() => { setNeedsOnboarding(false); setShowTour(true); }} />;
  }

  return (
    <div
      onClick={handleScreenClick}
      className="relative w-full h-screen bg-app overflow-hidden font-sans select-none text-white/90 cursor-pointer"
    >
      <VideoBackground
        patternId={selectedPattern.id}
        visualMode={visualMode}
        isNightMode={isNightMode}
        isPlaying={isPlaying}
        onReadyChange={handleVideoReady}
      />

      <AudioSession
        patternId={activePatternId}
        isPlaying={isPlaying}
        isBedMuted={isBedMuted}
        audioMode={lockedAudioModeRef.current}
      />

      {/* ── TOP HEADER ─────────────────────────────────────────────────── */}
      <div
        className={`absolute top-0 left-0 right-0 p-6 flex justify-between z-40 transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isPlaying && !uiVisible
            ? 'opacity-0 -translate-y-2 pointer-events-none'
            : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase">
            Prana.OS
          </span>
          {isPlaying && sessionStartTimeRef.current && (
            <span className="text-[10px] font-mono text-white/20 tracking-widest">
              {formatClock(elapsed)} / {formatClock(getPatternDurationMs(selectedPattern.id) / 1000)}
            </span>
          )}
        </div>

        <div className="flex gap-4">
          {/* Audio mode toggle — Headphones = Binaural (earphones), Speaker =
              Isochronic. Stays visible during playback (read-only, since the
              mode locks for the session) so the user can always see which
              bed track is playing; only editable before session starts. */}
          {!isPlaying && (
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setAudioMode(prev => prev === 'earphones' ? 'speaker' : 'earphones');
              }}
              tourId="audio-mode"
              title={
                audioMode === 'earphones'
                  ? 'Earphones: Binaural — tap to switch to Speaker (Isochronic)'
                  : 'Speaker: Isochronic — tap to switch to Earphones (Binaural)'
              }
            >
              {audioMode === 'earphones' ? <Headphones size={18} /> : <Speaker size={18} />}
            </IconButton>
          )}

          <IconButton onClick={handleToggleFullscreen} tourId="fullscreen" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </IconButton>

          <IconButton
            onClick={(e) => { e.stopPropagation(); toggleNightMode(); }}
            tourId="night"
            title={isNightMode ? 'Night Mode: ON' : 'Day Mode'}
          >
            {isNightMode ? <Moon size={18} /> : <Sun size={18} />}
          </IconButton>

          <IconButton
            onClick={(e) => { e.stopPropagation(); setIsBedMuted(b => !b); }}
            tourId="bed-mute"
            title={isBedMuted ? 'Background sound: off' : 'Background sound: on'}
          >
            {isBedMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>

          <IconButton
            onClick={(e) => { e.stopPropagation(); setIsChimesEnabled(c => !c); }}
            pulsing={showChimeNudge}
            tourId="chimes"
            title={isChimesEnabled ? 'Chimes: on' : 'Chimes: off'}
          >
            {isChimesEnabled ? <Bell size={18} /> : <BellOff size={18} />}
          </IconButton>

          {!isPlaying && (
            <IconButton onClick={(e) => { e.stopPropagation(); setShowInfo(true); }} title="About & tutorial">
              <Info size={18} />
            </IconButton>
          )}
        </div>
      </div>

      {/* ── CENTER TIMER ───────────────────────────────────────────────── */}
      <div
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isPlaying ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <h2
          className="text-xs font-bold tracking-[0.4em] uppercase mb-16 transition-all duration-1000"
          style={{ color: phaseColor, textShadow: '0 0 40px currentColor' }}
        >
          {PHASE_META[currentPhase].label}
        </h2>
        <BreathTimer
          remainingSeconds={remainingSeconds}
          phaseDuration={phaseDuration}
        />
        <p className="mt-16 text-[10px] tracking-[0.3em] uppercase text-white/30 font-light">
          {PHASE_META[currentPhase].instruction}
        </p>
      </div>

      {/* ── BOTTOM CONTROLS ────────────────────────────────────────────── */}
      <div
        className={`absolute bottom-0 inset-x-0 z-50 flex flex-col items-center pb-10 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isPlaying && uiVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 -top-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
        <div className="glass-panel relative z-10 flex items-center gap-3 px-4 py-2 rounded-full border border-white/5 text-white/40 mb-6">
          <InfinityIcon size={12} className="opacity-50" />
          <span className="text-[10px] tracking-[0.2em] font-medium">
            CYCLE <span className="text-white/80 ml-1">{String(cycles).padStart(2, '0')}</span>
          </span>
        </div>
        <button
          onClick={handleStop}
          className="relative z-10 flex items-center justify-center p-4 leading-none rounded-full bg-white/5 hover:bg-white/10 backdrop-blur border border-white/10 hover:border-white/30 text-white/40 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-95 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group pointer-events-auto"
          type="button"
        >
          {/* origin-center + the flex/leading-none wrapper above keep the
              icon's bounding box fixed while it rotates, so the button
              doesn't drift as the hover transform runs. */}
          <RotateCcw
            size={20}
            className="block origin-center group-hover:-rotate-90 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </button>
      </div>

      {/* ── START PANEL ────────────────────────────────────────────────── */}
      <Controls
        selectedPattern={selectedPattern}
        onSelectPattern={setSelectedPattern}
        visualMode={visualMode}
        onSelectVisual={setVisualMode}
        onStart={handleStart}
        visible={!isPlaying}
        isStarting={isStarting}
        isPreparing={!isVideoReady}
        isFullscreen={isFullscreen}
        stats={sessionStats}
        sleepElapsed={isPlaying && activePatternId === 'sleep' ? elapsed : null}
      />

      {/* ── HIDDEN-UI TAP HINT ─────────────────────────────────────────── */}
      {isPlaying && !uiVisible && (
        <div className="absolute inset-x-0 bottom-6 z-40 flex justify-center pointer-events-none">
          <div className="w-10 h-1 rounded-full bg-white/20 animate-pulse" />
        </div>
      )}

      {/* ── FIRST CYCLE PILL ───────────────────────────────────────────── */}
      {showFirstCyclePill && (
        <div className="absolute bottom-32 inset-x-0 z-60 flex justify-center pointer-events-none animate-in fade-in duration-500">
          <div className="px-4 py-2 rounded-full bg-white/10 backdrop-blur border border-white/10 text-[10px] tracking-[0.2em] text-white/50 uppercase">
            ● First Breath
          </div>
        </div>
      )}

      {/* ── INFO MODAL ─────────────────────────────────────────────────── */}
      {showInfo && (
        <InfoModal
          onClose={() => setShowInfo(false)}
          onReplayTour={() => { setShowInfo(false); setShowTour(true); }}
        />
      )}

      {/* ── FIRST-RUN TUTORIAL ─────────────────────────────────────────── */}
      {showTour && !isPlaying && (
        <Tour
          onClose={() => {
            setShowTour(false);
            patchMe({ tutorial_completed: true });
          }}
        />
      )}

      {/* ── OFFBOARDING ────────────────────────────────────────────────── */}
      {showOffboarding && (
        <OffboardingModal
          finalStats={finalStats}
          newlyEarned={newlyEarned}
          achievementDefs={achievementDefs}
          onDismiss={() => {
            setShowOffboarding(false);
            setNewlyEarned([]);
            setUiVisible(true);
          }}
        />
      )}
    </div>
  );
}