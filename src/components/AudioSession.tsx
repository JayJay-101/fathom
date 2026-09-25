import { useEffect, useRef } from 'react';
import { AudioOutputMode } from '../types';
import { getAudioBedUrl } from '../utils/assetMap';

// Bed track only. All chime playback lives in the PranaEngine, which
// schedules chimes sample-accurately on the AudioContext hardware timeline —
// this component is now just a thin wrapper around the looping ambient bed.
// HTMLAudioElement playback is not throttled in background tabs, so the bed
// keeps playing when the user is away.

interface AudioSessionProps {
  patternId: string;
  isPlaying: boolean;
  isBedMuted: boolean;
  // 'earphones' → binaural bed track, 'speaker' → isochronic bed track.
  // Locked for the lifetime of a session — only changes after stop + restart.
  audioMode: AudioOutputMode;
}

export const AudioSession = ({ patternId, isPlaying, isBedMuted, audioMode }: AudioSessionProps) => {
  const bedTrackRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = bedTrackRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(e => console.warn('Bed track autoplay blocked:', e));
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [isPlaying, patternId]);

  const bedType = audioMode === 'speaker' ? 'isochronic' : 'binaural';
  const bedTrackUrl = getAudioBedUrl(patternId, bedType);
  if (!bedTrackUrl) return null;

  return (
    <audio
      ref={bedTrackRef}
      src={bedTrackUrl}
      loop
      muted={isBedMuted}
      preload="auto"
    />
  );
};
