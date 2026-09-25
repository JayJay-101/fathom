// ─────────────────────────────────────────────────────────────────────────────
// Prana.OS — local storage layer.
//
// This module replaces the former src/api/client.ts. It exports the same
// function names and (near-identical) signatures, so call sites read the same
// as they did against the backend — only now nothing leaves the device.
//
// There is no network here, by design. The app runs offline, needs no
// account, and the user's history is theirs: see backup.ts for export/import.
// ─────────────────────────────────────────────────────────────────────────────

import { ACHIEVEMENTS, type AchievementDefinition } from '../data/achievements';
import { addSession, allSessions, type SessionRecord } from './db';
import { evaluate } from './achievements';
import { computeSessionFacts, computeStats, type UserStats } from './stats';
import { loadProfile, patchProfile, type LocalProfile } from './settings';

export type { AchievementDefinition } from '../data/achievements';
export type { UserStats } from './stats';
export type { SessionRecord } from './db';
export type { LocalProfile, Goal, ExperienceLevel } from './settings';
export { exportData, importData, type PranaBackup } from './backup';

// ── PROFILE ──────────────────────────────────────────────────────────────────

/**
 * The single implicit local user's profile. Kept async, and keeping the
 * unused `forceRefresh` parameter, so existing call sites are unchanged —
 * localStorage is synchronous, so there is nothing to refresh.
 */
export async function fetchMe(_forceRefresh = false): Promise<LocalProfile> {
  return loadProfile();
}

/** Was PATCH /api/me. The JWT parameter is gone — there is no server to authenticate to. */
export async function patchMe(patch: Partial<LocalProfile>): Promise<boolean> {
  try {
    patchProfile(patch);
    return true;
  } catch (e) {
    console.warn('[prana] profile update failed:', e);
    return false;
  }
}

// ── SESSION LOG ──────────────────────────────────────────────────────────────

/**
 * Mirrors the old SessionLogPayload minus `session_key` — there is no trial
 * quota to redeem, so sessions simply start. Kept otherwise identical so
 * exported history stays portable.
 */
export interface SessionLogPayload {
  client_recorded_at: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  pattern_id: string;
  visual_mode: string;
  audio_mode: string;
  cycles_completed: number;
  max_session_depth_reached: number | null;
  end_reason: 'completed' | 'user_stopped';
  is_backdated: boolean;
  review_rating: number | null;
  review_text: string | null;
}

export interface SessionLogResponse {
  session_id: string;
  newly_earned: string[];
}

/**
 * Writes the session to IndexedDB, then evaluates achievements against the
 * whole log — the same order the backend used (insert, commit, evaluate), so
 * the session just logged counts toward what it unlocks.
 */
export async function postSessionLog(payload: SessionLogPayload): Promise<SessionLogResponse> {
  try {
    const session_id = await addSession(payload);

    const sessions = await allSessions();
    const profile = loadProfile();
    const earnedIds = new Set(profile.earned_achievements.map(e => e.achievement_id));

    const newly_earned = evaluate(
      earnedIds,
      computeStats(sessions),
      computeSessionFacts(sessions),
    );

    if (newly_earned.length > 0) {
      const earned_at = new Date().toISOString();
      patchProfile({
        earned_achievements: [
          ...profile.earned_achievements,
          ...newly_earned.map(achievement_id => ({ achievement_id, earned_at })),
        ],
      });
    }

    return { session_id, newly_earned };
  } catch (e) {
    // A failed write must never eat the session-complete UI — the user still
    // sees their final stats, which were captured before this call.
    console.warn('[prana] session log failed:', e);
    return { session_id: '', newly_earned: [] };
  }
}

// ── STATS ────────────────────────────────────────────────────────────────────

export async function fetchStats(): Promise<UserStats | null> {
  try {
    return computeStats(await allSessions());
  } catch (e) {
    console.warn('[prana] stats read failed:', e);
    return null;
  }
}

// ── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

export interface AchievementsResponse {
  definitions: AchievementDefinition[];
  earned: { achievement_id: string; earned_at: string }[];
}

export async function fetchAchievements(): Promise<AchievementsResponse> {
  return { definitions: ACHIEVEMENTS, earned: loadProfile().earned_achievements };
}

/**
 * Session-log facts behind the conditions the old AchievementsPage could not
 * measure (pattern_used, all_patterns_tried, all_visuals_tried). Everything is
 * local now, so all of them are measurable — the page uses this for progress.
 */
export async function fetchSessionFacts() {
  try {
    return computeSessionFacts(await allSessions());
  } catch (e) {
    console.warn('[prana] session facts read failed:', e);
    return null;
  }
}

export async function fetchSessions(): Promise<SessionRecord[]> {
  try {
    return await allSessions();
  } catch (e) {
    console.warn('[prana] session history read failed:', e);
    return [];
  }
}
