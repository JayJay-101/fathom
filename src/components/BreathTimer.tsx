interface BreathTimerProps {
  remainingSeconds: number;
  // The phase duration determines display mode — not the live float value.
  // Only Tirumandiram has fractional durations (1.5s), so only it shows
  // decimal countdown. All other patterns show integer ceil countdown.
  phaseDuration: number;
}

export const BreathTimer = ({ remainingSeconds, phaseDuration }: BreathTimerProps) => {
  const isFractionalPhase = phaseDuration % 1 !== 0;

  const displayVal = isFractionalPhase
    ? remainingSeconds.toFixed(1)       // Tirumandiram: 1.5 → 1.4 → 1.3 …
    : String(Math.ceil(remainingSeconds)); // All others:  5 → 4 → 3 → 2 → 1

  return (
    <div className="text-8xl font-thin tracking-tighter tabular-nums text-white/20 mix-blend-overlay transition-all duration-300 ease-out">
      {displayVal}
    </div>
  );
};