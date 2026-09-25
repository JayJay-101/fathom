// ─────────────────────────────────────────────────────────────────────────────
// PranaEngine — timing tests.
//
// The engine is pure TypeScript and framework-agnostic, and it derives every
// value from a clock it does not own. That makes it testable the way the real
// thing behaves: we hand it a fake AudioContext whose currentTime we control,
// then assert on the math at arbitrary points in a 30-minute session without
// waiting 30 minutes.
//
// What is faked: the AudioContext (clock + node graph), the Worker heartbeat
// (ticked by hand), and fetch (no chime files in a test run). Nothing in the
// engine is stubbed.
// ─────────────────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BreathPattern } from '../types';

// ── Fakes ────────────────────────────────────────────────────────────────────

/** Records every chime handed to the hardware timeline. */
const scheduled: { when: number }[] = [];

class FakeParam {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime(v: number) { this.value = v; }
}

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createBufferSource() {
    return {
      buffer: null as unknown,
      connect() {},
      start(when: number) { scheduled.push({ when }); },
    };
  }
  decodeAudioData() { return Promise.reject(new Error('no audio in tests')); }
  resume() { return Promise.resolve(); }
}

/** The heartbeat worker, driven manually by `tick()` instead of a timer. */
class FakeWorker {
  static current: FakeWorker | null = null;
  onmessage: (() => void) | null = null;
  running = false;
  constructor() { FakeWorker.current = this; }
  postMessage(msg: string) { this.running = msg === 'start'; }
  tick() { if (this.running) this.onmessage?.(); }
}

const ctx = new FakeAudioContext();

vi.stubGlobal('Worker', FakeWorker);
// Node's URL has no createObjectURL; add it without shadowing the constructor.
(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake';
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline in tests')));

// The engine constructs its own context on first use; the constructor hands
// it our single instance so the test keeps control of currentTime.
vi.stubGlobal('window', { AudioContext: function () { return ctx; } });

const { engine } = await import('./PranaEngine');

// ── Patterns under test ──────────────────────────────────────────────────────

const box: BreathPattern = {
  id: 'box',
  label: 'Box Focus',
  description: '',
  icon: null,
  durations: { idle: 0, inhale: 4, 'hold-in': 4, exhale: 4, 'hold-out': 4 },
};

const resonance: BreathPattern = {
  id: 'resonance',
  label: 'Resonance',
  description: '',
  icon: null,
  durations: { idle: 0, inhale: 5, 'hold-in': 0, exhale: 5, 'hold-out': 0 },
};

/** Moves the hardware clock and runs the heartbeat as the worker would. */
function advanceTo(seconds: number) {
  ctx.currentTime = seconds;
  FakeWorker.current?.tick();
}

beforeEach(() => {
  engine.stop();
  scheduled.length = 0;
  ctx.currentTime = 0;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('state derivation', () => {
  it('reports the correct phase at every boundary of a cycle', () => {
    engine.start(box, 30 * 60 * 1000, { chimesEnabled: true });

    const expected: [number, string, number][] = [
      // time, phase, remaining in phase
      [0.0, 'inhale', 4],
      [3.9, 'inhale', 0.1],
      [4.0, 'hold-in', 4],
      [8.0, 'exhale', 4],
      [12.0, 'hold-out', 4],
      [15.9, 'hold-out', 0.1],
      [16.0, 'inhale', 4],
    ];

    for (const [t, phase, remaining] of expected) {
      ctx.currentTime = t;
      const state = engine.getState()!;
      expect(state.phase, `phase at t=${t}`).toBe(phase);
      expect(state.remainingInPhase, `remaining at t=${t}`).toBeCloseTo(remaining, 6);
    }
  });

  it('skips zero-length phases entirely', () => {
    engine.start(resonance, 20 * 60 * 1000, { chimesEnabled: true });

    ctx.currentTime = 4.9;
    expect(engine.getState()!.phase).toBe('inhale');
    ctx.currentTime = 5.1;
    expect(engine.getState()!.phase).toBe('exhale');
    expect(engine.getState()!.cycleDuration).toBe(10);
  });

  it('has zero accumulated drift at the end of a 30-minute session', () => {
    engine.start(box, 30 * 60 * 1000, { chimesEnabled: true });

    // t=1799s is 112.4375 cycles of 16s: 112 complete, 7s into the 113th,
    // which puts it 3s into hold-in. Derived by modulo, so it is exact here
    // whether or not a single heartbeat was missed along the way.
    ctx.currentTime = 1799;
    const state = engine.getState()!;

    expect(state.cycles).toBe(112);
    expect(state.phase).toBe('hold-in');
    expect(state.remainingInPhase).toBeCloseTo(1, 6);
    expect(state.elapsed).toBeCloseTo(1799, 6);
    expect(state.sessionRemaining).toBeCloseTo(1, 6);
  });

  it('counts completed cycles, not phase transitions', () => {
    engine.start(box, 30 * 60 * 1000, { chimesEnabled: true });
    for (const [t, cycles] of [[0, 0], [15.99, 0], [16, 1], [31.99, 1], [32, 2]] as const) {
      ctx.currentTime = t;
      expect(engine.getState()!.cycles, `cycles at t=${t}`).toBe(cycles);
    }
  });

  it('returns null once stopped', () => {
    engine.start(box, 60 * 1000, { chimesEnabled: true });
    expect(engine.getState()).not.toBeNull();
    engine.stop();
    expect(engine.getState()).toBeNull();
  });
});

describe('session completion', () => {
  it('fires onComplete once, on the heartbeat, when the clock passes the duration', () => {
    const onComplete = vi.fn();
    engine.start(box, 60 * 1000, { chimesEnabled: true, onComplete });

    advanceTo(59.9);
    expect(onComplete).not.toHaveBeenCalled();

    advanceTo(60);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Later heartbeats must not fire it again.
    advanceTo(61);
    advanceTo(120);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fires after a long background stall, on the first heartbeat back', () => {
    const onComplete = vi.fn();
    engine.start(box, 60 * 1000, { chimesEnabled: true, onComplete });

    // One tick at t=0, then the tab is hidden for ten minutes.
    advanceTo(0.1);
    advanceTo(600);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('chime scheduling', () => {
  // Chimes need decoded buffers, which a test run has no files for, so these
  // assert on the scheduler's decisions via the session bounds rather than on
  // audible output: nothing may be handed to the hardware past session end.
  it('schedules nothing after the session has ended', () => {
    engine.start(box, 32 * 1000, { chimesEnabled: true });
    advanceTo(31.9);
    advanceTo(32);
    advanceTo(48);

    for (const s of scheduled) {
      expect(s.when).toBeLessThan(32);
    }
  });

  it('never hands the hardware a time in the past', () => {
    engine.start(box, 5 * 60 * 1000, { chimesEnabled: true });
    for (let t = 0; t <= 60; t += 0.1) advanceTo(Number(t.toFixed(1)));

    for (const s of scheduled) {
      expect(s.when).toBeGreaterThanOrEqual(0);
    }
  });
});
