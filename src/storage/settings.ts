// ─────────────────────────────────────────────────────────────────────────────
// localStorage — settings and small derived counters.
//
// Everything here is either a user preference or a value cheap enough to
// recompute; the authoritative history lives in IndexedDB (see db.ts).
// Reads are defensive: a browser with storage disabled must not break the app,
// it just forgets preferences between reloads.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'prana_settings';

export type Goal = 'relaxation' | 'focus' | 'resonance';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/** The single implicit local user's profile. Port of the `users` columns that survived. */
export interface LocalProfile {
  onboarding_completed: boolean;
  tutorial_completed: boolean;
  goal: Goal | null;
  experience_level: ExperienceLevel | null;
  // Preferences the UI persists between sessions.
  visual_mode: string | null;
  audio_mode: string | null;
  chimes_enabled: boolean;
  night_mode_manual: boolean | null;
  // Earned achievements — port of `user_achievements` sans user_id. Small and
  // bounded (one entry per definition), so localStorage is the right home.
  earned_achievements: { achievement_id: string; earned_at: string }[];
}

export const DEFAULT_PROFILE: LocalProfile = {
  onboarding_completed: false,
  tutorial_completed: false,
  goal: null,
  experience_level: null,
  visual_mode: null,
  audio_mode: null,
  chimes_enabled: true,
  night_mode_manual: null,
  earned_achievements: [],
};

export function loadProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      earned_achievements: Array.isArray(parsed.earned_achievements)
        ? parsed.earned_achievements
        : [],
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: LocalProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('[prana] could not persist settings:', e);
  }
}

export function patchProfile(patch: Partial<LocalProfile>): LocalProfile {
  const next = { ...loadProfile(), ...patch };
  saveProfile(next);
  return next;
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
