// ─────────────────────────────────────────────────────────────────────────────
// Derived statistics — the local port of the backend's `user_stats` table.
//
// The server kept `user_stats` as a denormalised row updated inside the
// session-insert transaction, because recomputing across a multi-tenant table
// on every read would be wasteful. Locally the log is one user's and small, so
// the row is derived from it on demand instead: nothing can drift out of sync
// with the history, and an imported backup needs no separate stats blob.
// ─────────────────────────────────────────────────────────────────────────────

import type { SessionRecord } from './db';

export interface UserStats {
  lifetime_sessions_completed: number;
  lifetime_minutes: number;
  session_streak_days: number;
  avg_session_depth_reached: number;
}

/** Local calendar day of an ISO timestamp, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
}

/**
 * Consecutive days practised, counting back from today.
 *
 * Matches the backend's CASE expression: practising today extends the streak,
 * a gap of a full day ends it. A streak whose last day was yesterday is still
 * live (today just hasn't happened yet) — it only breaks once a day is missed.
 */
export function computeStreak(sessions: SessionRecord[], now = new Date()): number {
  if (sessions.length === 0) return 0;

  const days = new Set(sessions.map(s => localDay(s.started_at)));
  const pad = (n: number) => n.toString().padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  let cursor = days.has(today) ? today : dayBefore(today);
  if (!days.has(cursor)) return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = dayBefore(cursor);
  }
  return streak;
}

export function computeStats(sessions: SessionRecord[], now = new Date()): UserStats {
  const depths = sessions
    .map(s => s.max_session_depth_reached)
    .filter((d): d is number => typeof d === 'number');

  return {
    lifetime_sessions_completed: sessions.length,
    lifetime_minutes: sessions.reduce((sum, s) => sum + s.duration_minutes, 0),
    session_streak_days: computeStreak(sessions, now),
    // Depth is a removed V2 metric — every record carries null, so this stays
    // 0 unless the metric returns. Kept so the shape matches `user_stats`.
    avg_session_depth_reached: depths.length
      ? depths.reduce((a, b) => a + b, 0) / depths.length
      : 0,
  };
}

/**
 * Everything the achievement evaluator needs out of the session log itself.
 * The server gathered these in two aggregate SQL queries; locally it is one
 * pass over an array.
 */
export interface SessionFacts {
  maxDepth: number;
  distinctPatterns: number;
  distinctVisuals: number;
  patternCounts: Record<string, number>;
}

export function computeSessionFacts(sessions: SessionRecord[]): SessionFacts {
  const patternCounts: Record<string, number> = {};
  const visuals = new Set<string>();
  let maxDepth = 0;

  for (const s of sessions) {
    if (s.pattern_id) patternCounts[s.pattern_id] = (patternCounts[s.pattern_id] ?? 0) + 1;
    if (s.visual_mode) visuals.add(s.visual_mode);
    if (typeof s.max_session_depth_reached === 'number') {
      maxDepth = Math.max(maxDepth, s.max_session_depth_reached);
    }
  }

  return {
    maxDepth,
    distinctPatterns: Object.keys(patternCounts).length,
    distinctVisuals: visuals.size,
    patternCounts,
  };
}
