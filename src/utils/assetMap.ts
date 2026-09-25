import { VisualMode } from '../types';

// Media is served from the asset host rather than from this clone.
//
// Media is optional by design. Every consumer of these paths degrades
// gracefully when a file is absent — a missing video falls back to the CSS
// gradient in VideoBackground, a missing bed falls back to silence, and a
// missing chime is simply not scheduled. The app must never show a black
// void because a file didn't load.
const ASSET_BASE = 'https://prana-assets.forestily.com';
const VIDEO_DIR = `${ASSET_BASE}/video`;
const AUDIO_DIR = `${ASSET_BASE}/audio`;

export const getVideoUrl = (style: VisualMode, patternId: string, mode: 'day' | 'night') => {
  const safePattern = patternId === 'idle' ? 'onboarding' : patternId;

  // Maps the UI button names to the actual video files.
  const safeStyle = (style === 'geometry' || style === 'orbital') ? 'geometric' : 'mandala';

  return `${VIDEO_DIR}/prana_${safeStyle}_${safePattern}_${mode}.webm`;
};

export const getAudioBedUrl = (patternId: string, type: 'binaural' | 'isochronic' = 'binaural') => {
  if (patternId === 'idle') return null;
  const durationMap: Record<string, string> = { resonance: '20min', box: '10min', sleep: '30min', tirumandiram: '30min' };
  return `${AUDIO_DIR}/prana_${patternId}_${durationMap[patternId] || '30min'}_${type}.opus`;
};

// Chimes are read with fetch() (to decode into Web Audio buffers), which —
// unlike <video>/<audio> — is subject to CORS, and the asset host sends no
// CORS headers. They are requested same-origin under /media instead, which
// vercel.json (production) and vite.config.ts (dev) proxy to the asset host.
export const getChimeUrl = (phase: string) => `/media/audio/chime_${phase}.opus`;
