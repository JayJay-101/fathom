import { BreathPattern } from '../types';
import { PATTERNS } from '../data/presets';
import { Link } from 'react-router-dom';

interface ControlsProps {
  selectedPattern: BreathPattern;
  onSelectPattern: (pattern: BreathPattern) => void;
  onStart: () => void;
  visible: boolean;
  isStarting?: boolean;
  isPreparing?: boolean;  // selected video still loading
  isFullscreen?: boolean;
  stats?: { lifetime_sessions_completed: number; lifetime_minutes: number; session_streak_days: number } | null;
  sleepElapsed?: number | null;  // seconds elapsed in active sleep session; null = pre-session
}

export const Controls = ({
  selectedPattern,
  onSelectPattern,
  onStart,
  visible,
  isStarting = false,
  isPreparing = false,
  isFullscreen = false,
  stats = null,
  sleepElapsed = null,
}: ControlsProps) => {

  // MM:SS formatter for the sleep pattern live countdown
  const formatSleepCountdown = (remainingSeconds: number): string => {
    const s = Math.max(0, remainingSeconds);
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <div
      className={`absolute inset-0 z-30 flex flex-col items-center overflow-y-auto transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] hinge-fit-v ${
        visible
          ? 'opacity-100 pointer-events-auto backdrop-blur-sm bg-black/20'
          : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* m-auto centers when content fits; when it doesn't (short screens),
          the panel scrolls instead of clipping the Start button. pt clears
          the fixed header icon row. */}
      <div className="w-full max-w-2xl flex flex-col items-center gap-6 sm:gap-12 m-auto pt-20 pb-8 sm:py-8 hinge-aware">

        {/* 1. PATTERN SELECTOR */}
        <div className="flex flex-col items-center gap-4 w-full px-8">
          <span className="text-[9px] uppercase tracking-[0.3em] text-white/30 mb-2">
            Select Rhythm
          </span>
          <div className="flex flex-col gap-2 w-full">
            {PATTERNS.map((pattern) => {
              const isSelected = selectedPattern.id === pattern.id;
              return (
                <button
                  key={pattern.id}
                  onClick={() => onSelectPattern(pattern)}
                  data-tour={isSelected ? 'patterns' : undefined}
                  className={`w-full min-h-[48px] py-3 sm:py-4 px-4 text-center rounded-xl border relative group transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                    isSelected
                      ? 'border-white/20 bg-white/[0.07]'
                      : 'border-white/5 bg-white/0 hover:border-white/20 hover:bg-white/5'
                  } ${pattern.id === 'sleep' && isSelected ? 'sleep-glow' : ''}`}
                >
                  <span
                    className={`text-lg sm:text-xl font-light tracking-wide transition-all ${
                      isSelected
                        ? 'text-white'
                        : 'text-white/30 group-hover:text-white/60'
                    }`}
                  >
                    {pattern.label}
                  </span>

                  {/* Sleep — static "30 MIN" pre-session, live countdown during session */}
                  {pattern.id === 'sleep' && (
                    <span
                      className={`absolute right-4 top-1/2 -translate-y-1/2 text-[9px] text-white/20 tracking-widest uppercase transition-opacity duration-300 ${
                        sleepElapsed != null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {sleepElapsed != null
                        ? formatSleepCountdown(1800 - Math.floor(sleepElapsed))
                        : '30 MIN'
                      }
                    </span>
                  )}

                  {isSelected && (
                    <div className="text-[10px] text-cyan-400 mt-2 tracking-wider uppercase animate-in fade-in slide-in-from-top-1">
                      {pattern.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. STATS STRIP — visible only when data has loaded; absent on null */}
        {stats && (
          <div className="flex flex-col items-center gap-1.5 w-full px-8">
            <span className="text-[9px] uppercase tracking-[0.25em] text-white/20">
              Lifetime · {stats.lifetime_sessions_completed} Sessions · {(stats.lifetime_minutes / 60).toFixed(1)} Hrs · {stats.session_streak_days} Day Streak
            </span>
            <Link
              to="/achievements"
              data-tour="achievements"
              className="text-[9px] uppercase tracking-[0.25em] text-cyan-300/40 hover:text-cyan-300/80 transition-colors"
            >
              ✦ Achievements
            </Link>
          </div>
        )}

        {/* 3. START */}
        <div className="flex flex-col items-center gap-4 sm:gap-6 mt-2 sm:mt-8">
          <button
            onClick={onStart}
            data-tour="start"
            disabled={isStarting || isPreparing}
            className={`px-10 py-3.5 sm:px-12 sm:py-4 rounded-full border transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] tracking-[0.2em] text-xs uppercase ${
              isStarting || isPreparing
                ? 'border-white/20 text-white/40 cursor-wait animate-pulse'
                : 'border-white/20 hover:border-white text-white/60 hover:text-white hover:bg-white/5 ambient-pulse active:scale-95'
            }`}
          >
            {isStarting ? 'Starting…' : isPreparing ? 'Preparing…' : 'Enter Session'}
          </button>
          <span className="text-[9px] tracking-[0.3em] text-white/20 uppercase animate-pulse">
            {isFullscreen ? 'Tap Fullscreen Icon to Collapse' : 'Tap Enter Session to Begin'}
          </span>
        </div>

      </div>
    </div>
  );
};