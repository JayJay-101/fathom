# Media

The app reads its background videos and audio beds from this directory:

```
public/video/prana_{geometric|mandala}_{onboarding|resonance|box|sleep|tirumandiram}_{day|night}.webm
public/audio/prana_{resonance|box|sleep|tirumandiram}_{10min|20min|30min}_{binaural|isochronic}.opus
public/audio/chime_{inhale|hold-in|exhale|hold-out}.opus
```

All of it is optional. With no files present the app still runs a complete,
correctly timed session: backgrounds fall back to a CSS gradient, beds fall
back to silence, and chimes that fail to load are simply not scheduled.

When media *is* present, `scripts/generate-manifest.js` probes it with ffprobe
on `predev`/`prebuild` and writes the exact durations into
`src/data/generated-manifest.json`, which is what sets each pattern's session
length. Without ffprobe or without files, the committed manifest is kept.

If you add your own beds, note that a looping bed must be an exact multiple of
its pattern's cycle length or it will drift audibly against the
sample-accurate chimes. Cycle lengths: Resonance 10.0s, Box 16.0s, 4-7-8 19.0s,
Vedic 1:4:2 10.5s.
