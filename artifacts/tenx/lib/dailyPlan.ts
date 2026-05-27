import { ExamPhase } from "@/contexts/ExamModeContext";
import { Topic, daysOverdueOf, isDueToday, isOverdue } from "@/contexts/TopicsContext";

export interface PlannedItem {
  topic: Topic;
  estMin: number;
  status: "overdue" | "due";
  daysOverdue: number;
}

export interface DailyPlan {
  /** Topics that fit inside the user's daily time budget, in study order. */
  planned: PlannedItem[];
  /** Topics that should be reviewed but won't fit today. */
  deferred: PlannedItem[];
  /** Sum of estimated minutes for the planned items. */
  totalPlannedMin: number;
  /** Total minutes that all due+overdue topics would take. */
  totalNeededMin: number;
  /** Minutes still available inside the budget after planning. */
  remainingMin: number;
  /** Total candidates considered (overdue + due). */
  candidateCount: number;
  /** True when Vacation Mode is active — no topics are surfaced. */
  schedulePaused?: boolean;
}

const DEFAULT_TOPIC_MIN = 30;
const MIN_TOPIC_MIN = 10;
const MAX_TOPIC_MIN = 60;

/** Hard cap on how many topics appear in today's plan, regardless of budget. */
const MAX_TOPICS_PER_DAY = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Estimate time per topic from its recent session history (avg of last 5),
 * falling back to a 30-minute default. Clamped into a sane range and rounded
 * to the nearest 5 minutes so estimates feel deliberate. */
export function estimateMinutes(topic: Topic): number {
  const sessions = topic.sessions ?? [];
  if (sessions.length === 0) return DEFAULT_TOPIC_MIN;
  const recent = sessions.slice(0, 5);
  const avg =
    recent.reduce((sum, s) => sum + (s.minutes || 0), 0) / recent.length;
  if (!Number.isFinite(avg) || avg <= 0) return DEFAULT_TOPIC_MIN;
  const clamped = Math.min(MAX_TOPIC_MIN, Math.max(MIN_TOPIC_MIN, avg));
  return Math.max(MIN_TOPIC_MIN, Math.round(clamped / 5) * 5);
}

/** Build a "Today's Plan" by greedily fitting the most urgent topics into the
 * user's daily time budget. Overdue topics rank first (most days overdue
 * first), then topics due today (earliest scheduled first).
 *
 * An absolute cap of MAX_TOPICS_PER_DAY topics prevents overwhelming lists
 * even when the daily budget is very large. Excess topics go to `deferred`.
 *
 * When `vacationActive` is true, returns an empty plan with `schedulePaused`
 * set so the UI can render the vacation state. */
export function buildDailyPlan(
  topics: Topic[],
  budgetMin: number,
  now: number = Date.now(),
  vacationActive?: boolean,
): DailyPlan {
  if (vacationActive) {
    return {
      planned: [],
      deferred: [],
      totalPlannedMin: 0,
      totalNeededMin: 0,
      remainingMin: budgetMin,
      candidateCount: 0,
      schedulePaused: true,
    };
  }

  const overdue: PlannedItem[] = [];
  const due: PlannedItem[] = [];
  for (const topic of topics) {
    if (topic.disabled) continue;
    if (!topic.nextReviewAt) continue;
    if (topic.suspendedUntil && topic.suspendedUntil > now) continue;
    const estMin = estimateMinutes(topic);
    if (isOverdue(topic, now)) {
      overdue.push({
        topic,
        estMin,
        status: "overdue",
        daysOverdue: daysOverdueOf(topic, now),
      });
    } else if (isDueToday(topic, now)) {
      due.push({
        topic,
        estMin,
        status: "due",
        daysOverdue: 0,
      });
    }
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  due.sort(
    (a, b) => (a.topic.nextReviewAt ?? 0) - (b.topic.nextReviewAt ?? 0),
  );

  const candidates = [...overdue, ...due];
  const planned: PlannedItem[] = [];
  const deferred: PlannedItem[] = [];
  let used = 0;

  for (const item of candidates) {
    if (planned.length < MAX_TOPICS_PER_DAY && used + item.estMin <= budgetMin) {
      planned.push(item);
      used += item.estMin;
    } else {
      deferred.push(item);
    }
  }

  const totalNeededMin = candidates.reduce((sum, c) => sum + c.estMin, 0);

  return {
    planned,
    deferred,
    totalPlannedMin: used,
    totalNeededMin,
    remainingMin: Math.max(0, budgetMin - used),
    candidateCount: candidates.length,
  };
}

/**
 * Build a catch-up rescheduling plan for topics that overflow today's cap.
 *
 * Ranks deferred items by `daysOverdue × (1 / confidence)` so the most
 * urgent / least-confident topics surface earliest. Then spreads them evenly
 * across the coming N days (N = ceil(backlog / dailyCap)), assigning a
 * synthetic `nextReviewAt` value to each. The caller is responsible for
 * persisting these via `rescheduleTopics`.
 *
 * @param deferredItems  Topics that didn't fit in today's plan.
 * @param dailyCap       How many topics are in today's plan (used to pace the spread).
 * @param now            Current timestamp in ms (defaults to Date.now()).
 */
export function buildCatchupPlan(
  deferredItems: PlannedItem[],
  dailyCap: number,
  now: number = Date.now(),
): { topicId: string; nextReviewAt: number }[] {
  if (deferredItems.length === 0) return [];

  const cap = Math.max(1, dailyCap);
  const N = Math.max(1, Math.ceil(deferredItems.length / cap));

  const ranked = [...deferredItems].sort((a, b) => {
    const confA = Math.max(1, a.topic.confidence ?? 3);
    const confB = Math.max(1, b.topic.confidence ?? 3);
    const scoreA = a.daysOverdue * (1 / confA);
    const scoreB = b.daysOverdue * (1 / confB);
    return scoreB - scoreA;
  });

  const perDay = Math.ceil(ranked.length / N);

  return ranked.map((item, i) => {
    const dayOffset = Math.floor(i / perDay) + 1;
    return {
      topicId: item.topic.id,
      nextReviewAt: now + dayOffset * DAY_MS,
    };
  });
}

/**
 * Exam Mode priority score for a topic.
 *
 * Weight table:
 *   Hard + Important  → 6 (extreme)
 *   Hard              → 5 (very high)
 *   Medium + Important→ 4 (high)
 *   Medium            → 3 (medium)
 *   Easy + Important  → 2 (medium-low)
 *   Easy              → 1 (low)
 */
function examPriorityScore(topic: Topic): number {
  const lastDiff = topic.sessions?.[0]?.difficulty ?? "medium";
  const important = !!topic.isImportant;
  if (lastDiff === "hard" && important) return 6;
  if (lastDiff === "hard") return 5;
  if (lastDiff === "medium" && important) return 4;
  if (lastDiff === "medium") return 3;
  if (lastDiff === "easy" && important) return 2;
  return 1; // easy
}

/** Average minutes per session (last 5), or Infinity when no sessions. */
function avgSessionMin(topic: Topic): number {
  const s = topic.sessions ?? [];
  if (s.length === 0) return Infinity;
  const recent = s.slice(0, 5);
  return recent.reduce((sum, x) => sum + x.minutes, 0) / recent.length;
}

/**
 * Build the revision queue when Exam Mode is active.
 *
 * Phase semantics:
 *   "active"  — normal days before exam: only due/overdue exam-subject topics,
 *               sorted by priority score; when <= 7 days left also pulls
 *               topics due within the next 3 days.
 *   "eve"     — 1 day before exam: only important + fast-recall (avg < 20 min).
 *   "day"     — exam day: no revision (returns empty plan).
 *   "ended"   — exam has passed: treated as "active" fallback until auto-deactivation runs.
 */
export function buildExamDailyPlan(
  topics: Topic[],
  examSubjects: string[],
  examDate: number,
  examPhase: ExamPhase,
  budgetMin: number,
  now: number = Date.now(),
): DailyPlan {
  const empty: DailyPlan = {
    planned: [],
    deferred: [],
    totalPlannedMin: 0,
    totalNeededMin: 0,
    remainingMin: budgetMin,
    candidateCount: 0,
  };

  // Exam day → no revision
  if (examPhase === "day") return empty;

  const daysLeft = Math.max(0, Math.ceil((examDate - now) / DAY_MS));

  // Filter to non-suspended, selected-subject topics only
  const pool = topics.filter((t) => {
    if (t.disabled) return false;
    if (!examSubjects.includes(t.subject)) return false;
    if (t.suspendedUntil && t.suspendedUntil > now) return false;
    return true;
  });

  // Eve phase: only important AND fast-recall topics (strict AND semantics)
  if (examPhase === "eve") {
    const eveTopics = pool.filter((t) => t.isImportant && avgSessionMin(t) <= 20);
    eveTopics.sort((a, b) => examPriorityScore(b) - examPriorityScore(a));
    const planned: PlannedItem[] = eveTopics.map((t) => ({
      topic: t,
      estMin: estimateMinutes(t),
      status: (isOverdue(t, now) ? "overdue" : "due") as "overdue" | "due",
      daysOverdue: daysOverdueOf(t, now),
    }));
    const totalNeededMin = planned.reduce((s, p) => s + p.estMin, 0);
    return {
      planned,
      deferred: [],
      totalPlannedMin: totalNeededMin,
      totalNeededMin,
      remainingMin: 0,
      candidateCount: planned.length,
    };
  }

  // Build candidate list
  const seen = new Set<string>();
  let candidates: PlannedItem[] = [];

  for (const topic of pool) {
    if (seen.has(topic.id)) continue;
    const overdueTopic = isOverdue(topic, now);
    const dueTodayTopic = isDueToday(topic, now);
    const estMin = estimateMinutes(topic);
    const daysOv = daysOverdueOf(topic, now);

    if (overdueTopic) {
      candidates.push({ topic, estMin, status: "overdue", daysOverdue: daysOv });
      seen.add(topic.id);
    } else if (dueTodayTopic) {
      candidates.push({ topic, estMin, status: "due", daysOverdue: 0 });
      seen.add(topic.id);
    } else if (!topic.nextReviewAt) {
      // Never studied → always candidate in exam mode
      candidates.push({ topic, estMin, status: "due", daysOverdue: 0 });
      seen.add(topic.id);
    } else if (daysLeft <= 15 && topic.nextReviewAt) {
      // Aggressive look-ahead: 7–15 days → 5-day window; ≤7 days → 3-day window
      const daysUntilDue = Math.ceil((topic.nextReviewAt - now) / DAY_MS);
      const lookAhead = daysLeft <= 7 ? Math.min(daysLeft, 3) : 5;
      if (daysUntilDue <= lookAhead) {
        candidates.push({ topic, estMin, status: "due", daysOverdue: 0 });
        seen.add(topic.id);
      }
    }
  }

  // Sort by combined priority: overdue bonus + exam priority score
  candidates.sort((a, b) => {
    const scoreA = examPriorityScore(a.topic) + (a.daysOverdue > 0 ? 2 : 0);
    const scoreB = examPriorityScore(b.topic) + (b.daysOverdue > 0 ? 2 : 0);
    return scoreB - scoreA;
  });

  // Greedy budget fill
  const planned: PlannedItem[] = [];
  const deferred: PlannedItem[] = [];
  let used = 0;

  for (const item of candidates) {
    if (used + item.estMin <= budgetMin) {
      planned.push(item);
      used += item.estMin;
    } else {
      deferred.push(item);
    }
  }

  const totalNeededMin = candidates.reduce((s, c) => s + c.estMin, 0);
  return {
    planned,
    deferred,
    totalPlannedMin: used,
    totalNeededMin,
    remainingMin: Math.max(0, budgetMin - used),
    candidateCount: candidates.length,
  };
}

export function formatHM(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} m`;
}
