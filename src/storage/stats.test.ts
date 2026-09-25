import { describe, expect, it } from 'vitest';
import { computeSessionFacts, computeStats, computeStreak } from './stats';
import { checkCondition, evaluate } from './achievements';
import type { SessionRecord } from './db';

/** A session started `daysAgo` days before `now`, at midday local time. */
function session(daysAgo: number, overrides: Partial<SessionRecord> = {}, now = new Date(2026, 8, 17)): SessionRecord {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0);
  return {
    id: `s${daysAgo}-${overrides.pattern_id ?? 'box'}`,
    client_recorded_at: d.toISOString(),
    started_at: d.toISOString(),
    ended_at: d.toISOString(),
    duration_minutes: 10,
    pattern_id: 'box',
    visual_mode: 'geometry',
    audio_mode: 'binaural',
    cycles_completed: 37,
    max_session_depth_reached: null,
    end_reason: 'completed',
    is_backdated: false,
    review_rating: null,
    review_text: null,
    ...overrides,
  };
}

const NOW = new Date(2026, 8, 17);

describe('computeStreak', () => {
  it('is 0 with no sessions', () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak([session(0), session(1), session(2)], NOW)).toBe(3);
  });

  it('stays alive when the last session was yesterday', () => {
    // Today simply hasn't happened yet — the streak breaks on a missed day,
    // not on an unfinished one. This mirrors the backend's CASE expression.
    expect(computeStreak([session(1), session(2)], NOW)).toBe(2);
  });

  it('breaks once a day is missed', () => {
    expect(computeStreak([session(2), session(3)], NOW)).toBe(0);
    expect(computeStreak([session(0), session(2), session(3)], NOW)).toBe(1);
  });

  it('counts a day once however many sessions it holds', () => {
    const twiceToday = [session(0, { id: 'a' }), session(0, { id: 'b' }), session(1)];
    expect(computeStreak(twiceToday, NOW)).toBe(2);
  });
});

describe('computeStats', () => {
  it('sums sessions and minutes', () => {
    const stats = computeStats([session(0), session(1, { duration_minutes: 20 })], NOW);
    expect(stats.lifetime_sessions_completed).toBe(2);
    expect(stats.lifetime_minutes).toBe(30);
    expect(stats.session_streak_days).toBe(2);
  });

  it('reports depth as 0 while the metric is absent', () => {
    expect(computeStats([session(0)], NOW).avg_session_depth_reached).toBe(0);
  });
});

describe('computeSessionFacts', () => {
  it('counts distinct patterns, visuals and per-pattern totals', () => {
    const facts = computeSessionFacts([
      session(0, { id: 'a', pattern_id: 'box' }),
      session(1, { id: 'b', pattern_id: 'box' }),
      session(2, { id: 'c', pattern_id: 'sleep', visual_mode: 'aurora' }),
    ]);
    expect(facts.distinctPatterns).toBe(2);
    expect(facts.distinctVisuals).toBe(2);
    expect(facts.patternCounts).toEqual({ box: 2, sleep: 1 });
  });
});

describe('checkCondition', () => {
  const stats = { lifetime_sessions_completed: 10, lifetime_minutes: 120, session_streak_days: 4, avg_session_depth_reached: 0 };
  const facts = { maxDepth: 0, distinctPatterns: 3, distinctVisuals: 2, patternCounts: { box: 7 } };

  it('handles every condition type the backend defined', () => {
    expect(checkCondition({ type: 'sessions_count', value: 10 }, stats, facts)).toBe(true);
    expect(checkCondition({ type: 'sessions_count', value: 11 }, stats, facts)).toBe(false);
    expect(checkCondition({ type: 'total_minutes', value: 60 }, stats, facts)).toBe(true);
    expect(checkCondition({ type: 'streak_days', value: 7 }, stats, facts)).toBe(false);
    expect(checkCondition({ type: 'pattern_used', pattern_id: 'box', sessions: 5 }, stats, facts)).toBe(true);
    expect(checkCondition({ type: 'pattern_used', pattern_id: 'sleep', sessions: 1 }, stats, facts)).toBe(false);
    expect(checkCondition({ type: 'all_patterns_tried', count: 4 }, stats, facts)).toBe(false);
    expect(checkCondition({ type: 'all_visuals_tried', count: 2 }, stats, facts)).toBe(true);
  });

  it('accepts `threshold` as the legacy alias of `value`', () => {
    expect(checkCondition({ type: 'sessions_count', threshold: 10 }, stats, facts)).toBe(true);
  });
});

describe('evaluate', () => {
  const definitions = [
    { id: 'first', title: '', description: '', icon_key: '', category: '', sort_order: 1, condition: { type: 'sessions_count' as const, value: 1 } },
    { id: 'ten', title: '', description: '', icon_key: '', category: '', sort_order: 2, condition: { type: 'sessions_count' as const, value: 10 } },
  ];
  const facts = computeSessionFacts([session(0)]);

  it('returns only newly satisfied definitions', () => {
    const stats = computeStats([session(0)], NOW);
    expect(evaluate(new Set(), stats, facts, definitions)).toEqual(['first']);
  });

  it('never re-awards what is already earned', () => {
    const stats = computeStats([session(0)], NOW);
    expect(evaluate(new Set(['first']), stats, facts, definitions)).toEqual([]);
  });
});
