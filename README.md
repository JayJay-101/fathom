# Fathom

[![CI](https://github.com/JayJay-101/fathom/actions/workflows/ci.yml/badge.svg)](https://github.com/JayJay-101/fathom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An open-source breathing and meditation app that runs entirely in the
browser. No account, no backend: the app is a static bundle, your history
stays on your device, and the background videos and sound stream from a CDN
(they're optional; without them it still runs a complete session).

- **Four guided patterns:** Resonance, Box Focus, 4-7-8 and Vedic 1:4:2
- **Sample-accurate timing:** a 30-minute session ends and chimes exactly on
  time, even with the tab in the background
- **Smooth on phones:** the session video is buffered before you start, and
  the day/night switch is instant
- **Guided first run:** an interactive tour with a pointing finger walks new
  users through every control, on phone and desktop
- **Local history:** streaks, stats and achievements stored in IndexedDB
- **Your data stays yours:** one-click JSON export and import; your history
  never leaves the device

## Why this project exists

I'm a backend engineer. Fathom began as a React client talking to a Go +
Postgres API with accounts, billing and a trial quota. I rebuilt it as a
serverless, client-only app, and wrote the frontend the way I'd write a
backend service:

| Backend habit | Where it shows up here |
| --- | --- |
| One source of truth, derived state | `PranaEngine` computes every value from a single clock reading. Nothing accumulates. |
| Keep business rules out of handlers | Session accounting, streaks and achievement rules are pure modules with unit tests. The React components only call them. |
| Schema and migrations | The server's `session_logs` table became an indexed IndexedDB store, with a versioned upgrade path. |
| Port, then delete | The server-side achievement evaluator was ported to the client unchanged. Auth, billing and quota code was removed. |
| Work that must survive a busy main thread | The scheduler heartbeat runs in a Web Worker, and chimes are handed off to the audio hardware ahead of time. |
| CI gates every change | GitHub Actions runs the typecheck, tests and production build on every PR. |
| Profile with real traces, then fix the cause | Mobile video stutter was traced in the network panel to duplicate downloads and bandwidth contention, not fixed with guesswork. |
| Degrade gracefully | Missing media falls back to a gradient or silence, and every loading gate has a timeout, so nothing can hang. |

## Quick start

```bash
git clone https://github.com/JayJay-101/fathom.git
cd fathom
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm test` | Vitest suite (engine, session accounting, stats, achievements) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck and production bundle into `dist/` |

There are no environment variables and no services to run. `dist/` is a
static bundle you can serve from any file host (a `vercel.json` is included).

## Architecture

```
┌──────────────────────── Browser ─────────────────────────┐
│                                                          │
│  React UI  ──reads──▶  PranaEngine  ◀──ticks── Web Worker │
│ (slave renderer)       (master clock:                    │
│                        AudioContext.currentTime)         │
│      │                     │ schedules chimes ahead      │
│      │                     ▼                             │
│      │               Audio hardware                      │
│      ▼                                                   │
│  session/summary ──▶ storage/ ──▶ IndexedDB  (history)    │
│  (pure rules)          │         localStorage (settings)  │
│                        └──▶ JSON export / import         │
└──────────────────────────────────────────────────────────┘
```

### The timing engine: `src/engine/PranaEngine.ts`

A meditation session is a promise about time. The chime at minute 29 has to
land exactly where the chime at second 1 did. Naive timers break that promise
in three ways: `setInterval` drifts, background tabs get throttled, and any
`remaining -= dt` loop piles up its own rounding error. The engine avoids all
three:

- **It reads a hardware clock.** Time comes from `AudioContext.currentTime`,
  which the audio device drives. It doesn't drift and it keeps full precision
  while the tab is hidden.
- **State is derived, never accumulated.** `getState()` works out phase,
  remaining seconds and cycle count from `now - startTime` with modulo
  arithmetic. There's no running total to go wrong, and a test asserts this
  at t = 1799 s.
- **Chimes are scheduled ahead.** Each heartbeat looks 350 ms into the future
  and passes any upcoming chime to the hardware with `source.start(t)`. Once
  that happens, the chime plays on time even if the main thread stalls.
- **The heartbeat runs in a Web Worker,** so browsers don't throttle it in
  background tabs.

The UI, including the `<video>` background, is re-synced to the engine on
every animation frame. It never keeps time on its own.

### Session accounting: `src/session/summary.ts`

When a session ends, one pure function turns the raw facts (start, end,
target length, engine cycle count) into what gets logged. It caps the
duration at the target, reconciles the cycle count and drops sessions that
are too short. Keeping this logic out of the React handler lets it be tested
directly.

### Data layer: `src/storage/`

| Store | Holds | Why this store |
| --- | --- | --- |
| IndexedDB `prana/session_logs` | Session history | Grows without limit and is queried by date for streaks, so it needs an index |
| localStorage `prana_settings` | Preferences and earned achievements | Small, bounded key/value data |

Stats and streaks (`stats.ts`) and achievement rules (`achievements.ts`) are
pure functions over session records, and each has its own tests. Since there's
no server copy of your data, **Export** on the Achievements page writes
everything to a JSON file and **Import** restores it.

### User experience: `src/components/`

The UX work was about making a media-heavy app feel instant and calm on a
mid-range phone.

- **No stuttering start.** The session video loads in the *same* `<video>`
  element that will show it (browsers don't share ranged media downloads
  between elements), buffering invisibly on the start panel. **Enter
  Session** reads *Preparing…* until the video can play through, so the
  session always opens on smooth playback. The wait happens before the tap,
  because phones only allow audio to start inside a user gesture.
- **Instant night mode.** Day and night videos are both kept loaded; the
  second one only starts downloading after the first is ready, so it never
  slows the start. A toggle resumes the other video at the same frame and
  swaps it in once it's playing.
- **Blackout, not jank.** If a video is still loading or stalls, the
  background fades to black instead of showing broken frames. The breath
  counter keeps running on top.
- **Bandwidth budget.** Only the video on screen and the one audio bed the
  user chose are downloaded; the other bed and mode are never fetched early.
- **Guided first run** (`Tour.tsx`). A welcome card, then a spotlight and
  animated pointing finger over each control with a one-line tip tagged
  *Before session* or *Anytime*, ending in a "what works when" matrix. It
  finds controls by `data-tour` attributes, flips and clamps its tip to fit
  any screen, says *Tap* or *Click* by input type, supports keyboard
  navigation, respects `prefers-reduced-motion`, and can be replayed from ⓘ.
- **No dead controls.** The earphones/speaker switch is hidden once a
  session starts, since the audio bed is locked for the session.

## Project layout

```
src/engine/      PranaEngine: the master clock (start here)
src/session/     pure session-accounting rules
src/storage/     IndexedDB, settings, stats, achievements, backup
src/data/        breathing presets, achievement definitions, asset manifest
src/hooks/       React bindings to the engine
src/components/  UI, all of it rendered from engine state
src/pages/       onboarding and achievements
scripts/         build-time media manifest generator
```

## Media

Background videos and audio beds go in `public/` and are optional (see
[`public/README.md`](public/README.md)). Without them the app still runs a
complete, correctly timed session. Backgrounds fall back to a CSS gradient
and audio beds fall back to silence.

## Tech stack

TypeScript · React 18 · Vite · Tailwind CSS · Web Audio API · Web Workers ·
IndexedDB · Vitest · GitHub Actions

## Roadmap

- [ ] Custom breathing patterns
- [ ] Installable PWA with offline media caching
- [ ] Higher-resolution and portrait video encodes for phones
- [ ] Practice-over-time charts
- [ ] Optional self-hosted sync server (Go), for people who want their
      history across devices

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup
and ground rules.

## License

[MIT](LICENSE)
 
