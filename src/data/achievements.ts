// ─────────────────────────────────────────────────────────────────────────────
// Achievement definitions — ported from the backend's achievement_definitions
// table (pranad migrations 0008_more_achievements.sql and the original seed
// rows at sort_order 1-5). These are static data: the app evaluates them
// client-side after every session, exactly as internal/achievements/evaluator.go
// did server-side.
//
// Condition key conventions, unchanged from the table:
//   numeric thresholds use `value`; `threshold` is kept as a legacy alias.
//   all_patterns_tried / all_visuals_tried use `count` (distinct session
//   values needed). pattern_used uses `pattern_id` + `sessions`.
// ─────────────────────────────────────────────────────────────────────────────

export interface AchievementCondition {
  type:
    | 'sessions_count'
    | 'sessions_completed'
    | 'total_minutes'
    | 'lifetime_minutes'
    | 'streak_days'
    | 'session_depth'
    | 'max_depth'
    | 'pattern_used'
    | 'all_patterns_tried'
    | 'all_visuals_tried';
  value?: number;
  threshold?: number;
  count?: number;
  pattern_id?: string;
  sessions?: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon_key: string;
  category: string;
  condition: AchievementCondition;
  sort_order: number;
}

// The two depth-based conditions from the backend (`session_depth`,
// `max_depth`) have no definitions here on purpose: depth was a WASM metric
// removed in V2, so `max_session_depth_reached` is always null and any
// depth achievement would be permanently unreachable. The evaluator still
// implements both condition types, so re-adding a definition is data-only
// if the metric ever comes back.
export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_breath',
    title: 'First Breath',
    description: 'Completed your first session',
    icon_key: 'lotus',
    category: 'milestones',
    condition: { type: 'sessions_count', value: 1 },
    sort_order: 1,
  },
  {
    id: 'week_streak',
    title: 'Seven Days',
    description: 'Maintained a 7-day meditation streak',
    icon_key: 'fire',
    category: 'streaks',
    condition: { type: 'streak_days', value: 7 },
    sort_order: 2,
  },
  {
    id: 'ten_sessions',
    title: 'Ten Deep',
    description: 'Completed 10 meditation sessions',
    icon_key: 'star',
    category: 'milestones',
    condition: { type: 'sessions_count', value: 10 },
    sort_order: 3,
  },
  {
    id: 'hour_of_calm',
    title: 'An Hour of Calm',
    description: 'Meditated for 1 hour total',
    icon_key: 'clock',
    category: 'time',
    condition: { type: 'total_minutes', value: 60 },
    sort_order: 4,
  },
  {
    id: 'box_devotee',
    title: 'Squared Away',
    description: 'Completed 10 sessions of Box Focus',
    icon_key: 'lotus',
    category: 'exploration',
    condition: { type: 'pattern_used', pattern_id: 'box', sessions: 10 },
    sort_order: 5,
  },
  {
    id: 'three_day_streak',
    title: 'Finding Rhythm',
    description: 'Maintained a 3-day meditation streak',
    icon_key: 'fire',
    category: 'streaks',
    condition: { type: 'streak_days', value: 3 },
    sort_order: 6,
  },
  {
    id: 'month_streak',
    title: 'Unbreakable',
    description: 'Maintained a 30-day meditation streak',
    icon_key: 'fire',
    category: 'streaks',
    condition: { type: 'streak_days', value: 30 },
    sort_order: 7,
  },
  {
    id: 'twentyfive_sessions',
    title: 'Committed',
    description: 'Completed 25 meditation sessions',
    icon_key: 'star',
    category: 'milestones',
    condition: { type: 'sessions_count', value: 25 },
    sort_order: 8,
  },
  {
    id: 'fifty_sessions',
    title: 'Half Century',
    description: 'Completed 50 meditation sessions',
    icon_key: 'star',
    category: 'milestones',
    condition: { type: 'sessions_count', value: 50 },
    sort_order: 9,
  },
  {
    id: 'hundred_sessions',
    title: 'Centurion',
    description: 'Completed 100 meditation sessions',
    icon_key: 'star',
    category: 'milestones',
    condition: { type: 'sessions_count', value: 100 },
    sort_order: 10,
  },
  {
    id: 'five_hours',
    title: 'Deep Time',
    description: 'Meditated for 5 hours total',
    icon_key: 'clock',
    category: 'time',
    condition: { type: 'total_minutes', value: 300 },
    sort_order: 11,
  },
  {
    id: 'day_of_breath',
    title: 'Full Day',
    description: 'Meditated for 24 hours total',
    icon_key: 'clock',
    category: 'time',
    condition: { type: 'total_minutes', value: 1440 },
    sort_order: 12,
  },
  {
    id: 'pattern_explorer',
    title: 'Explorer',
    description: 'Tried every breathing pattern',
    icon_key: 'lotus',
    category: 'exploration',
    condition: { type: 'all_patterns_tried', count: 4 },
    sort_order: 14,
  },
  {
    id: 'visual_explorer',
    title: 'Scenic Route',
    description: 'Tried every visual mode',
    icon_key: 'lotus',
    category: 'exploration',
    condition: { type: 'all_visuals_tried', count: 2 },
    sort_order: 15,
  },
];
