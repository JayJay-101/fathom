import React from 'react';
import { AchievementDefinition } from '../storage';

interface OffboardingModalProps {
  finalStats: { minutes: number; cycles: number };
  newlyEarned: string[];
  achievementDefs: Record<string, AchievementDefinition>;
  onDismiss: () => void;
}

export const OffboardingModal: React.FC<OffboardingModalProps> = ({
  finalStats,
  newlyEarned,
  achievementDefs,
  onDismiss,
}) => (
  <div
    className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-700"
    onClick={(e) => e.stopPropagation()}
  >
    <div className="flex flex-col items-center gap-6 w-full max-w-xs px-8 py-12 border border-white/10 bg-black/30">
      <p className="text-[9px] uppercase tracking-[0.5em] text-white/30">Session Complete</p>
      <p className="text-xs tracking-[0.4em] text-white/60 uppercase">
        {Math.round(finalStats.minutes)} Minutes · {finalStats.cycles} Cycles
      </p>

      {newlyEarned.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          {newlyEarned.map(id => (
            <p key={id} className="text-[9px] tracking-[0.25em] uppercase text-cyan-400/60">
              ✦ {(achievementDefs[id]?.title ?? id.replace(/_/g, ' ')).toUpperCase()} UNLOCKED
            </p>
          ))}
        </div>
      )}

      <button
        onClick={onDismiss}
        className="mt-4 px-12 py-4 rounded-full border border-white/20 hover:border-white text-white/60 hover:text-white hover:bg-white/5 transition-all duration-500 tracking-[0.2em] text-xs uppercase"
        type="button"
      >
        Begin Again
      </button>
    </div>
  </div>
);
