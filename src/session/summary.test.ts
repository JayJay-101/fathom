import { describe, expect, it } from 'vitest';
import { cycleLengthSec, formatClock, summarizeSession } from './summary';
import type { BreathPattern } from '../types';

const box: BreathPattern = {
  id: 'box', label: 'Box', description: '', icon: null,
  durations: { idle: 0, inhale: 4, 'hold-in': 4, exhale: 4, 'hold-out': 4 },
};

const base = { pattern: box, startedAtMs: 0, targetMs: 10 * 60_000, engineCycles: 0 };

describe('summarizeSession', () => {
  it('drops sessions shorter than the minimum', () => {
    expect(summarizeSession({ ...base, endedAtMs: 4_000 })).toBeNull();
  });

  it('caps duration at the target length', () => {
    const s = summarizeSession({ ...base, endedAtMs: 60 * 60_000 });
    expect(s?.durationMinutes).toBe(10);
  });

  it('derives cycles from duration when the engine count is stale', () => {
    const s = summarizeSession({ ...base, endedAtMs: 160_000 });
    expect(s?.cycles).toBe(10); // 160s / 16s
  });

  it('prefers the engine count when it is higher', () => {
    const s = summarizeSession({ ...base, endedAtMs: 160_000, engineCycles: 11 });
    expect(s?.cycles).toBe(11);
  });

  it('treats a clock that went backwards as zero duration', () => {
    expect(summarizeSession({ ...base, startedAtMs: 10_000, endedAtMs: 0 })).toBeNull();
  });
});

describe('helpers', () => {
  it('sums the four breathing phases', () => {
    expect(cycleLengthSec(box)).toBe(16);
  });

  it('formats MM:SS', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1799.9)).toBe('29:59');
  });
});
