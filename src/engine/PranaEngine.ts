import { Phase, BreathPattern } from '../types';
import { getChimeUrl } from '../utils/assetMap';
import chimesConfig from '../data/chimes.json';

// ─────────────────────────────────────────────────────────────────────────────
// PranaEngine — the Master Clock.
//
// This is the single source of truth for session time. It is pure TypeScript,
// framework-agnostic, and owns the AudioContext hardware clock. Everything
// else in the app (React UI, countdown text, <video> elements) is a slave
// renderer that asks this engine "what time is it?" and draws accordingly.
//
// Three properties make it precise:
//
//  1. AudioContext.currentTime is a hardware clock. It does not drift with
//     the JS event loop, is not batched by React, and keeps advancing at
//     full precision while the tab is backgrounded (as long as the context
//     is running).
//
//  2. Chimes are LOOKAHEAD-SCHEDULED: on every heartbeat we scan a short
//     window into the future and hand any upcoming chime to the audio
//     hardware with source.start(absoluteTime). Once handed off, the chime
//     strikes at that exact time even if the main thread stalls completely.
//
//  3. State is derived, never accumulated. getState() computes the current
//     phase/remaining/cycles from (now - startTime) with modulo math, so a
//     30-minute session is exactly as accurate at minute 29 as at second 1.
//     There is no per-tick "remaining -= dt" that can compound error.
//
// The heartbeat is a dumb inline Web Worker: setInterval inside a Worker is
// immune to background-tab throttling, so scheduling (and session
// completion) keeps running when the user is away from the tab.
// ─────────────────────────────────────────────────────────────────────────────

const ORDERED_PHASES: Phase[] = ['inhale', 'hold-in', 'exhale', 'hold-out'];

// Heartbeat period. Only needs to be comfortably smaller than the lookahead
// window — precision comes from the hardware timeline, not from this rate.
const HEARTBEAT_MS = 100;

// How far into the future we hand chimes to the hardware. Large enough to
// survive a couple of missed heartbeats, small enough that toggling chimes
// or stopping feels immediate.
const LOOKAHEAD_SEC = 0.35;

// Chimes are struck slightly BEFORE the phase boundary so their perceived
// onset lands on the transition (preserves the old pre-cue behaviour, but
// now scheduled sample-accurately instead of fired from a React callback).
const CHIME_LEAD_SEC = 0.2;

const CHIME_GAIN = 0.6;

interface ActivePhase {
  phase: Phase;
  duration: number; // seconds, > 0
  offset: number;   // seconds from cycle start
}

export interface EngineState {
  phase: Phase;
  phaseDuration: number;      // seconds
  remainingInPhase: number;   // seconds, mathematically exact float
  progress: number;           // 0..1 within current phase
  cycles: number;             // completed full cycles
  cycleDuration: number;      // exact mathematical cycle length from the preset (seconds)
  elapsed: number;            // seconds since session start
  sessionRemaining: number;   // seconds until auto-complete
  done: boolean;
}

export interface StartOptions {
  chimesEnabled: boolean;
  /** Seconds from session start after which chimes stop being scheduled (e.g. sleep). */
  chimeCutoffSec?: number | null;
  /** Fired once, on the heartbeat, when elapsed >= session duration. Runs even in background tabs. */
  onComplete?: () => void;
}

class PranaEngine {
  private ctx: AudioContext | null = null;
  private chimeGain: GainNode | null = null;
  private buffers: Partial<Record<Phase, AudioBuffer>> = {};
  private bufferLoadPromise: Promise<void> | null = null;

  private worker: Worker | null = null;

  private playing = false;
  private completed = false;
  private startTime = 0;          // ctx.currentTime at session start
  private sessionDuration = 0;    // seconds
  private pattern: BreathPattern | null = null;
  private activePhases: ActivePhase[] = [];
  private cycleDuration = 0;

  // Scheduler cursor: the next phase boundary that needs a chime handed to
  // the hardware. Expressed as (cycle index, index into activePhases).
  private schedCycle = 0;
  private schedPhaseIdx = 0;

  private chimeCutoffSec: number | null = null;
  private onComplete: (() => void) | null = null;

  // ── AUDIO CONTEXT / ASSETS ────────────────────────────────────────────────

  /** Must be called from a user gesture at least once so the context can run. */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.chimeGain = this.ctx.createGain();
      this.chimeGain.gain.value = CHIME_GAIN;
      this.chimeGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Idempotent. Safe to call early (e.g. on app mount) to warm the cache. */
  preloadChimes(): Promise<void> {
    if (this.bufferLoadPromise) return this.bufferLoadPromise;
    this.bufferLoadPromise = (async () => {
      const ctx = this.ensureContext();
      await Promise.all(ORDERED_PHASES.map(async phase => {
        try {
          const res = await fetch(getChimeUrl(phase));
          const raw = await res.arrayBuffer();
          this.buffers[phase] = await ctx.decodeAudioData(raw);
        } catch (err) {
          console.warn(`Chime load failed for "${phase}"`, err);
        }
      }));
    })();
    return this.bufferLoadPromise;
  }

  // ── LIFECYCLE ─────────────────────────────────────────────────────────────

  start(pattern: BreathPattern, sessionDurationMs: number, opts: StartOptions) {
    const ctx = this.ensureContext();
    this.preloadChimes();

    this.pattern = pattern;
    this.activePhases = [];
    let offset = 0;
    for (const phase of ORDERED_PHASES) {
      const duration = pattern.durations[phase];
      if (duration > 0) {
        this.activePhases.push({ phase, duration, offset });
        offset += duration;
      }
    }
    this.cycleDuration = offset;
    if (this.cycleDuration <= 0 || this.activePhases.length === 0) return;

    this.sessionDuration = sessionDurationMs / 1000;
    this.chimeCutoffSec = opts.chimeCutoffSec ?? null;
    this.onComplete = opts.onComplete ?? null;
    this.setChimesEnabled(opts.chimesEnabled);

    this.startTime = ctx.currentTime;
    this.schedCycle = 0;
    this.schedPhaseIdx = 0;
    this.completed = false;
    this.playing = true;

    // Schedule the immediate window synchronously, inside the user gesture —
    // this covers the very first chime at t=0.
    this.scheduleAhead();
    this.startHeartbeat();
  }

  stop() {
    this.playing = false;
    this.onComplete = null;
    this.stopHeartbeat();
    // Chimes already handed to the hardware within the lookahead window are
    // silenced by ramping the shared gain, then restoring it for next time.
    if (this.ctx && this.chimeGain) {
      this.chimeGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.chimeGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.chimeGain.gain.setValueAtTime(this.chimesEnabled ? CHIME_GAIN : 0, this.ctx.currentTime + LOOKAHEAD_SEC + 1);
    }
  }

  private chimesEnabled = true;

  /** Instant: routes through a gain node, so already-scheduled chimes obey it too. */
  setChimesEnabled(enabled: boolean) {
    this.chimesEnabled = enabled;
    if (this.ctx && this.chimeGain) {
      this.chimeGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.chimeGain.gain.setValueAtTime(enabled ? CHIME_GAIN : 0, this.ctx.currentTime);
    }
  }

  // ── HEARTBEAT (dumb worker — immune to background-tab throttling) ────────

  private startHeartbeat() {
    if (!this.worker) {
      const src = `
        let id = null;
        self.onmessage = (e) => {
          if (e.data === 'start' && !id) id = setInterval(() => postMessage('tick'), ${HEARTBEAT_MS});
          else if (e.data === 'stop') { clearInterval(id); id = null; }
        };
      `;
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      this.worker.onmessage = () => this.onHeartbeat();
    }
    this.worker.postMessage('start');
  }

  private stopHeartbeat() {
    this.worker?.postMessage('stop');
  }

  private onHeartbeat() {
    if (!this.playing || !this.ctx) return;

    this.scheduleAhead();

    // Session completion checked against the hardware clock — fires on time
    // even when the tab is hidden (unlike setTimeout).
    if (!this.completed && this.ctx.currentTime - this.startTime >= this.sessionDuration) {
      this.completed = true;
      this.onComplete?.();
    }
  }

  // ── LOOKAHEAD SCHEDULER ───────────────────────────────────────────────────

  private scheduleAhead() {
    const ctx = this.ctx;
    if (!ctx || !this.pattern) return;

    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    const patternChimes = (chimesConfig as Record<string, Partial<Record<Phase, boolean>>>)[this.pattern.id];

    // Absolute time the cursor's phase begins.
    let boundary = this.startTime + this.schedCycle * this.cycleDuration
                 + this.activePhases[this.schedPhaseIdx].offset;

    // Safety bound: even after a long background stall the fast-forward is
    // capped; the modulo math in getState() needs no catch-up at all.
    let guard = 10000;
    while (boundary - CHIME_LEAD_SEC < horizon && guard-- > 0) {
      const phaseStartSec = boundary - this.startTime;
      if (phaseStartSec >= this.sessionDuration) break; // never chime past session end

      const { phase } = this.activePhases[this.schedPhaseIdx];
      const withinCutoff = this.chimeCutoffSec == null || phaseStartSec < this.chimeCutoffSec;
      const buffer = this.buffers[phase];

      if (patternChimes?.[phase] && withinCutoff && buffer && this.chimeGain) {
        const when = Math.max(boundary - CHIME_LEAD_SEC, ctx.currentTime);
        // Skip chimes whose moment passed while the heartbeat was stalled —
        // striking a stale chime now would be noise, not guidance.
        if (boundary - ctx.currentTime > -0.05) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.chimeGain);
          source.start(when); // handed to the hardware timeline — atomic
        }
      }

      // Advance cursor to the next phase boundary.
      this.schedPhaseIdx += 1;
      if (this.schedPhaseIdx >= this.activePhases.length) {
        this.schedPhaseIdx = 0;
        this.schedCycle += 1;
      }
      boundary = this.startTime + this.schedCycle * this.cycleDuration
               + this.activePhases[this.schedPhaseIdx].offset;
    }
  }

  // ── PURE MATH STATE EXTRACTION (for slave renderers) ─────────────────────

  getState(): EngineState | null {
    if (!this.playing || !this.ctx || this.cycleDuration <= 0) return null;

    const elapsed = Math.max(0, this.ctx.currentTime - this.startTime);
    const cycles = Math.floor(elapsed / this.cycleDuration);
    const inCycle = elapsed - cycles * this.cycleDuration;

    let active = this.activePhases[this.activePhases.length - 1];
    for (const p of this.activePhases) {
      if (inCycle < p.offset + p.duration) { active = p; break; }
    }
    const inPhase = inCycle - active.offset;

    return {
      phase: active.phase,
      phaseDuration: active.duration,
      remainingInPhase: Math.max(0, active.duration - inPhase),
      progress: Math.min(1, inPhase / active.duration),
      cycles,
      cycleDuration: this.cycleDuration,
      elapsed,
      sessionRemaining: Math.max(0, this.sessionDuration - elapsed),
      done: this.completed,
    };
  }

  get isPlaying() { return this.playing; }
}

// Singleton — one hardware clock for the whole app.
export const engine = new PranaEngine();
