import { Topic } from "@/contexts/TopicsContext";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayStat {
  /** ms timestamp at start-of-day for this bucket */
  dayStart: number;
  /** Short weekday label, e.g. "Mon" */
  label: string;
  /** Minutes studied during this day */
  minutes: number;
  /** Sessions completed during this day */
  sessions: number;
}

export interface InsightsSummary {
  totalMinutes: number;
  totalSessions: number;
  /** Per-day buckets for the last 7 days, oldest → newest */
  last7Days: DayStat[];
  /** Total minutes across the last 7 days */
  weekMinutes: number;
  /** Distinct days with at least one session in the last 7 days */
  activeDaysWeek: number;
  /** Sessions where daysOverdueAtStart === 0 (rated on time) */
  onTimeSessions: number;
  /** 0..1 ratio of on-time vs total sessions */
  onTimeRatio: number;
  /** Sum of pauseCount across all sessions */
  totalPauses: number;
  /** Average pauses per session (0 when no sessions) */
  avgPausesPerSession: number;
  /** 0..100 — heuristic chance of a strong rank from current habits */
  rankChance: number;
  /** Short qualitative label that pairs with the rankChance number */
  rankLabel: string;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function buildInsights(
  topics: Topic[],
  now: number = Date.now(),
): InsightsSummary {
  const today = startOfDay(now);
  const buckets: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = today - i * DAY_MS;
    buckets.push({
      dayStart,
      label: WEEKDAY_SHORT[new Date(dayStart).getDay()] ?? "",
      minutes: 0,
      sessions: 0,
    });
  }

  let totalMinutes = 0;
  let totalSessions = 0;
  let onTimeSessions = 0;
  let totalPauses = 0;

  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      totalMinutes += s.minutes ?? 0;
      totalSessions += 1;
      if ((s.daysOverdueAtStart ?? 0) === 0) onTimeSessions += 1;
      const p = (s as { pauseCount?: number }).pauseCount;
      if (typeof p === "number" && p > 0) totalPauses += p;

      const sessionDay = startOfDay(s.startedAt);
      const idx = buckets.findIndex((b) => b.dayStart === sessionDay);
      if (idx >= 0) {
        buckets[idx]!.minutes += s.minutes ?? 0;
        buckets[idx]!.sessions += 1;
      }
    }
  }

  const weekMinutes = buckets.reduce((sum, b) => sum + b.minutes, 0);
  const activeDaysWeek = buckets.filter((b) => b.sessions > 0).length;
  const onTimeRatio = totalSessions > 0 ? onTimeSessions / totalSessions : 0;
  const avgPausesPerSession =
    totalSessions > 0 ? totalPauses / totalSessions : 0;

  const hoursWeek = weekMinutes / 60;
  const hoursScore = Math.min(1, hoursWeek / 20); // 20h/week is excellent
  const consistencyScore = activeDaysWeek / 7;
  const onTimeScore = onTimeRatio;
  const focusScore = Math.max(0, 1 - avgPausesPerSession / 5);

  const raw =
    0.35 * hoursScore +
    0.25 * consistencyScore +
    0.25 * onTimeScore +
    0.15 * focusScore;
  const rankChance =
    totalSessions === 0 ? 0 : Math.round(Math.min(1, Math.max(0, raw)) * 100);

  let rankLabel = "Just getting started";
  if (rankChance >= 80) rankLabel = "Top tier trajectory";
  else if (rankChance >= 60) rankLabel = "Strong contender";
  else if (rankChance >= 40) rankLabel = "Building momentum";
  else if (rankChance >= 20) rankLabel = "Warming up";

  return {
    totalMinutes,
    totalSessions,
    last7Days: buckets,
    weekMinutes,
    activeDaysWeek,
    onTimeSessions,
    onTimeRatio,
    totalPauses,
    avgPausesPerSession,
    rankChance,
    rankLabel,
  };
}

export function formatHoursMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}
