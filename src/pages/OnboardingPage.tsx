import { useState } from 'react';
import { patchMe } from '../storage';

type Goal = 'relaxation' | 'focus' | 'resonance';
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

const GOALS: { value: Goal; label: string }[] = [
  { value: 'relaxation', label: 'I need to rest' },
  { value: 'focus',      label: 'I want to be sharper' },
  { value: 'resonance',  label: 'I want to feel grounded' },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner',     label: 'This is new to me' },
  { value: 'intermediate', label: 'I practice occasionally' },
  { value: 'advanced',     label: 'It is part of my routine' },
];

const ADVANCE_DELAY_MS = 500;

// First run only. Rendered by App as local state rather than a guarded route:
// with no account there is nothing to guard, and nothing to redirect to.
export function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [step, setStep]   = useState<1 | 2>(1);
  const [goal, setGoal]   = useState<Goal | null>(null);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectGoal(value: Goal) {
    setGoal(value);
    setTimeout(() => setStep(2), ADVANCE_DELAY_MS);
  }

  function selectExperienceLevel(value: ExperienceLevel) {
    setExperienceLevel(value);
    setTimeout(() => handleComplete(value), ADVANCE_DELAY_MS);
  }

  async function handleComplete(level: ExperienceLevel) {
    if (!goal) return;
    setSubmitting(true);
    setError(null);
    const ok = await patchMe({
      goal,
      experience_level: level,
      onboarding_completed: true,
    });
    if (!ok) {
      setSubmitting(false);
      setError('Could not save your preferences — browser storage may be blocked.');
      return;
    }
    onComplete();
  }

  return (
    <div className="relative w-full min-h-screen bg-black flex flex-col items-center justify-center text-white/90 select-none px-6">
      <span className="absolute top-8 text-[10px] font-bold tracking-[0.2em] text-white/20 uppercase">
        Prana.OS
      </span>

      {step === 1 && (
        <div className="w-full max-w-sm flex flex-col items-center gap-8">
          <h1 className="text-[13px] tracking-[0.25em] uppercase text-white/80 text-center">
            How do you want to feel?
          </h1>

          <div className="w-full flex flex-col gap-3">
            {GOALS.map(g => (
              <button
                key={g.value}
                onClick={() => selectGoal(g.value)}
                className={[
                  'w-full text-center px-5 py-4 sm:py-5 rounded-sm border',
                  'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  'hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
                  goal === g.value
                    ? 'border-white/40 bg-white/5 shadow-[0_0_24px_rgba(255,255,255,0.08)]'
                    : 'border-white/8 bg-transparent hover:border-white/20',
                ].join(' ')}
              >
                <span className="block text-[11px] tracking-[0.2em] uppercase text-white/70">
                  {g.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="w-full max-w-sm flex flex-col items-center gap-8">
          <h1 className="text-[13px] tracking-[0.25em] uppercase text-white/80 text-center">
            Have you explored your breath before?
          </h1>

          <div className="w-full flex flex-col gap-3">
            {EXPERIENCE_LEVELS.map(e => (
              <button
                key={e.value}
                disabled={submitting}
                onClick={() => selectExperienceLevel(e.value)}
                className={[
                  'w-full text-center px-5 py-4 sm:py-5 rounded-sm border',
                  'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  'hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0',
                  experienceLevel === e.value
                    ? 'border-white/40 bg-white/5 shadow-[0_0_24px_rgba(255,255,255,0.08)]'
                    : 'border-white/8 bg-transparent hover:border-white/20',
                  submitting ? 'opacity-50 cursor-not-allowed hover:translate-y-0' : '',
                ].join(' ')}
              >
                <span className="block text-[11px] tracking-[0.2em] uppercase text-white/70">
                  {e.label}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <p className="text-[9px] tracking-[0.2em] uppercase text-red-400/60">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
