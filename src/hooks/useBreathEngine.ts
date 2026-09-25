import { useEffect, useState, useRef } from 'react';
import { Phase } from '../types';
import { engine } from '../engine/PranaEngine';

// ─────────────────────────────────────────────────────────────────────────────
// The React slave. This hook contains NO timing logic — it runs a
// requestAnimationFrame loop that asks the PranaEngine (the AudioContext
// master clock) for the exact current state and mirrors it into React state.
//
// React renders are only triggered when a value the user can actually SEE
// changes (phase name, countdown digit, cycle count, elapsed second), so the
// UI stays perfectly in step with the hardware clock without re-rendering at
// 60fps. When the tab is hidden, rAF pauses and the UI freezes — but the
// engine keeps running on its hardware clock, so the first frame after the
// tab returns is already mathematically exact. No catch-up, no drift.
// ─────────────────────────────────────────────────────────────────────────────

interface UiSnapshot {
  currentPhase: Phase;
  phaseDuration: number;
  remainingSeconds: number;
  progress: number;
  cycles: number;
  elapsed: number; // whole seconds, for MM:SS displays
}

const IDLE: UiSnapshot = {
  currentPhase: 'idle',
  phaseDuration: 0,
  remainingSeconds: 0,
  progress: 0,
  cycles: 0,
  elapsed: 0,
};

export const useBreathEngine = (isPlaying: boolean) => {
  const [snapshot, setSnapshot] = useState<UiSnapshot>(IDLE);
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!isPlaying) {
      lastKeyRef.current = '';
      setSnapshot(IDLE);
      return;
    }

    let frameId: number;

    const renderLoop = () => {
      const state = engine.getState();
      if (state) {
        const fractional = state.phaseDuration % 1 !== 0;
        // The displayed countdown value (see BreathTimer): tenths for
        // fractional-duration patterns, ceil for the rest.
        const displayRemaining = fractional
          ? Math.round(state.remainingInPhase * 10) / 10
          : Math.ceil(state.remainingInPhase);
        const elapsedWhole = Math.floor(state.elapsed);

        const key = `${state.phase}|${displayRemaining}|${state.cycles}|${elapsedWhole}`;
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          setSnapshot({
            currentPhase: state.phase,
            phaseDuration: state.phaseDuration,
            remainingSeconds: state.remainingInPhase,
            progress: state.progress,
            cycles: state.cycles,
            elapsed: elapsedWhole,
          });
        }
      }
      frameId = requestAnimationFrame(renderLoop);
    };

    frameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

  return snapshot;
};
