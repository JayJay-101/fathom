import { BreathPattern, Phase } from '../types';

// Sessions shorter than this are discarded rather than logged — a tap on
// Start followed immediately by Stop is not a session.
export const MIN_SESSION_MINUTES = 5 / 60;

const CYCLE_PHASES: Phase[] = ['inhale', 'hold-in', 'exhale', 'hold-out'];

export interface SessionSummary {
  durationMinutes: number;
  cycles: number;
}

export function cycleLengthSec(pattern: BreathPattern): number {
  return CYCLE_PHASES.reduce((acc, phase) => acc + pattern.durations[phase], 0);
}

/**
 * Turns the raw facts about a finished session into the numbers that get
 * logged. Pure, so the rules live in one tested place instead of a handler.
 *
 * - Wall-clock duration is capped at the target length: completion can be
 *   observed late (backgrounded tab), and a late observation is not extra
 *   practice.
 * - Cycles take the larger of the engine's count and the count implied by
 *   duration, which guards against a stale engine read after stop.
 * - Returns null for sessions too short to log.
 */
export function summarizeSession(args: {
  pattern: BreathPattern;
  startedAtMs: number;
  endedAtMs: number;
  targetMs: number;
  engineCycles: number;
}): SessionSummary | null {
  const actualMs = Math.max(0, args.endedAtMs - args.startedAtMs);
  const cappedMs = Math.min(actualMs, args.targetMs);
  const durationMinutes = cappedMs / 60000;
  if (durationMinutes < MIN_SESSION_MINUTES) return null;

  const cycleSec = cycleLengthSec(args.pattern);
  const expectedCycles = cycleSec > 0 ? Math.floor(cappedMs / 1000 / cycleSec) : 0;

  return { durationMinutes, cycles: Math.max(args.engineCycles, expectedCycles) };
}

/** MM:SS for the session header. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
