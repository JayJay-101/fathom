import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAchievements,
  fetchStats,
  fetchSessionFacts,
  AchievementDefinition,
  UserStats,
} from '../storage';
import type { AchievementsResponse } from '../storage';
import type { SessionFacts } from '../storage/stats';
import { DataControls } from '../components/DataControls';

const ICONS: Record<string, string> = {
  lotus: '🪷',
  fire:  '🔥',
  star:  '✦',
  clock: '◷',
  ocean: '〜',
};

// Progress toward a condition. Everything is local now, so the conditions
// this function used to give up on (max_depth, pattern_used, all_*_tried)
// are all measurable: `facts` is the same one-pass aggregate over the session
// log that the evaluator itself uses.
function progressFor(
  def: AchievementDefinition,
  stats: UserStats | null,
  facts: SessionFacts | null,
): { current: number; target: number } | null {
  if (!stats) return null;

  switch (def.condition.type) {
    case 'pattern_used': {
      const target = def.condition.sessions ?? 0;
      if (target <= 0 || !facts) return null;
      return { current: facts.patternCounts[def.condition.pattern_id ?? ''] ?? 0, target };
    }
    case 'all_patterns_tried': {
      const target = def.condition.count ?? 0;
      if (target <= 0 || !facts) return null;
      return { current: facts.distinctPatterns, target };
    }
    case 'all_visuals_tried': {
      const target = def.condition.count ?? 0;
      if (target <= 0 || !facts) return null;
      return { current: facts.distinctVisuals, target };
    }
  }

  const target = def.condition.value ?? def.condition.threshold ?? 0;
  if (target <= 0) return null;
  switch (def.condition.type) {
    case 'sessions_count':
    case 'sessions_completed':
      return { current: stats.lifetime_sessions_completed, target };
    case 'total_minutes':
    case 'lifetime_minutes':
      return { current: stats.lifetime_minutes, target };
    case 'streak_days':
      return { current: stats.session_streak_days, target };
    case 'session_depth':
      return { current: stats.avg_session_depth_reached, target };
    case 'max_depth':
      return facts ? { current: facts.maxDepth, target } : null;
    default:
      return null;
  }
}

const formatValue = (type: string, n: number) =>
  type === 'session_depth' ? `${Math.round(n * 100)}%` : Math.floor(n).toString();

export function AchievementsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [facts, setFacts] = useState<SessionFacts | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-read after an import replaces the local data.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([fetchAchievements(), fetchStats(), fetchSessionFacts()]).then(([a, s, f]) => {
      setData(a);
      setStats(s);
      setFacts(f);
      setLoading(false);
    });
  }, [reloadKey]);

  const earnedById = new Map<string, string>(
    (data?.earned ?? []).map(e => [e.achievement_id, e.earned_at])
  );

  // Group by category, preserving sort_order within and across groups
  const groups: { category: string; defs: AchievementDefinition[] }[] = [];
  for (const def of [...(data?.definitions ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
    const g = groups.find(g => g.category === def.category);
    if (g) g.defs.push(def);
    else groups.push({ category: def.category, defs: [def] });
  }

  const totalDefs = data?.definitions.length ?? 0;

  return (
    <div className="min-h-screen bg-app text-white/90 flex flex-col items-center px-4 py-8 sm:px-6 sm:py-16 select-none hinge-aware">
      <button
        onClick={() => navigate('/')}
        className="self-start text-[10px] tracking-[0.2em] uppercase text-white/30 hover:text-white/60 transition-colors"
      >
        ← Back
      </button>

      <h1 className="text-xl sm:text-2xl font-light tracking-wide mt-6 sm:mt-8">Achievements</h1>
      <p className="text-[10px] sm:text-[11px] tracking-[0.15em] uppercase text-white/40 mt-2 text-center">
        {totalDefs > 0 ? `${earnedById.size} of ${totalDefs} unlocked` : 'Your journey, marked'}
      </p>

      <div className="w-full max-w-2xl mt-8 sm:mt-10 flex flex-col gap-8">
        {loading && (
          <p className="text-[11px] text-white/30 uppercase tracking-[0.2em] text-center">
            Loading…
          </p>
        )}
        {!loading && !data && (
          <p className="text-[11px] text-white/30 uppercase tracking-[0.2em] text-center">
            Could not load achievements
          </p>
        )}

        {groups.map(group => (
          <section key={group.category}>
            <h2 className="text-[10px] tracking-[0.25em] uppercase text-white/30 mb-3">
              {group.category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {group.defs.map(def => {
                const earnedAt = earnedById.get(def.id);
                const progress = earnedAt ? null : progressFor(def, stats, facts);
                const pct = progress
                  ? Math.min(100, (progress.current / progress.target) * 100)
                  : 0;
                return (
                  <div
                    key={def.id}
                    className={`glass-panel border rounded-2xl p-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      earnedAt
                        ? 'border-cyan-300/30 hover:border-cyan-300/60'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`text-xl leading-none ${
                          earnedAt ? 'text-cyan-300' : 'text-white/20 grayscale'
                        }`}
                      >
                        {ICONS[def.icon_key] ?? '✦'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] ${earnedAt ? 'text-white' : 'text-white/50'}`}>
                          {def.title}
                        </p>
                        <p className="text-[11px] text-white/40 mt-0.5">{def.description}</p>
                        {earnedAt && (
                          <p className="text-[10px] text-cyan-300/70 uppercase tracking-[0.15em] mt-2">
                            Unlocked {new Date(earnedAt).toLocaleDateString()}
                          </p>
                        )}
                        {progress && (
                          <div className="mt-2.5">
                            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-cyan-300/50 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-white/25 mt-1 tracking-wider">
                              {formatValue(def.condition.type, progress.current)} / {formatValue(def.condition.type, progress.target)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <DataControls onImported={() => setReloadKey(k => k + 1)} />
      </div>
    </div>
  );
}
