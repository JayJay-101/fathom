// ─────────────────────────────────────────────────────────────────────────────
// Achievement evaluation — a direct port of internal/achievements/evaluator.go.
//
// checkCondition is pure: every value it needs is already in `stats` or
// `facts`, so it is trivially testable, exactly as the Go version was.
// ─────────────────────────────────────────────────────────────────────────────

import { ACHIEVEMENTS, type AchievementCondition, type AchievementDefinition } from '../data/achievements';
import type { SessionFacts, UserStats } from './stats';

/** Seeded rows use `value`; `threshold` is the legacy alias. */
function threshold(c: AchievementCondition): number {
  return c.value ?? c.threshold ?? 0;
}

export function checkCondition(
  c: AchievementCondition,
  stats: UserStats,
  facts: SessionFacts,
): boolean {
  switch (c.type) {
    case 'sessions_completed':
    case 'sessions_count':
      return stats.lifetime_sessions_completed >= threshold(c);

    case 'lifetime_minutes':
    case 'total_minutes':
      return stats.lifetime_minutes >= threshold(c);

    case 'streak_days':
      return stats.session_streak_days >= threshold(c);

    case 'session_depth':
      return stats.avg_session_depth_reached >= threshold(c);

    case 'max_depth':
      // Deepest single session, not the lifetime average.
      return facts.maxDepth >= threshold(c);

    case 'pattern_used':
      return (facts.patternCounts[c.pattern_id ?? ''] ?? 0) >= (c.sessions ?? 0);

    case 'all_patterns_tried':
      return facts.distinctPatterns >= (c.count ?? 0);

    case 'all_visuals_tried':
      return facts.distinctVisuals >= (c.count ?? 0);

    default:
      console.warn(`[prana] unknown achievement condition type "${(c as AchievementCondition).type}"`);
      return false;
  }
}

/**
 * Returns the IDs of definitions newly satisfied — those not in `earnedIds`
 * whose condition now holds. Awarding (persisting them) is the caller's job.
 */
export function evaluate(
  earnedIds: Set<string>,
  stats: UserStats,
  facts: SessionFacts,
  definitions: AchievementDefinition[] = ACHIEVEMENTS,
): string[] {
  return definitions
    .filter(def => !earnedIds.has(def.id) && checkCondition(def.condition, stats, facts))
    .map(def => def.id);
}
