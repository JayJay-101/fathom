# Contributing

Thanks for taking a look. Fathom is small on purpose, so the bar for a
change is "does it keep the app offline, correct, and simple?"

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
```

Before opening a PR, run what CI runs:

```bash
npm run typecheck
npm test
npm run build
```

## Ground rules

- **No backend.** No accounts, analytics or API calls; the only network
  traffic is optional media from the CDN. If a feature needs a server, it
  doesn't belong here.
- **The engine owns time.** UI code reads `engine.getState()`; it never keeps
  its own timers for anything the user can hear or that gets logged.
- **Logic goes in pure modules with tests.** `src/engine`, `src/session` and
  `src/storage/stats.ts` are the pattern — React components call them, they
  don't contain the rules.
- **Schema changes need a migration.** Bump `DB_VERSION` in
  `src/storage/db.ts` and handle the upgrade in `onupgradeneeded`; people's
  history is only in their browser.

## Good first issues

- Custom breathing patterns (user-defined phase durations)
- A PWA manifest + service worker so the app installs and caches media
- Charts of practice over time on the Achievements page
