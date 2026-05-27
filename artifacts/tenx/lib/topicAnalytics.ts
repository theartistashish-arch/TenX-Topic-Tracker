import { Difficulty, StudySession, Topic } from "@/contexts/TopicsContext";

const DIFF_NUM: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function forgettingCurvePoints(
  stability: number,
  totalDays: number = 14,
  steps: number = 80,
): { t: number; r: number }[] {
  const s = Math.max(0.5, stability);
  const points: { t: number; r: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * totalDays;
    const r = Math.exp(-t / s);
    points.push({ t, r });
  }
  return points;
}

export function timeOfDayBuckets(sessions: StudySession[]): number[] {
  const buckets = new Array(24).fill(0) as number[];
  for (const s of sessions) {
    const h = new Date(s.startedAt).getHours();
    buckets[h] = (buckets[h] ?? 0) + 1;
  }
  return buckets;
}

export function difficultyTrendValues(sessions: StudySession[]): number[] {
  return [...sessions].reverse().map((s) => DIFF_NUM[s.difficulty] ?? 2);
}

export function isMastered(topic: Topic): boolean {
  const sessions = topic.sessions ?? [];
  if (sessions.length < 5) return false;
  const last3 = sessions.slice(0, 3);
  if (!last3.every((s) => s.difficulty === "easy")) return false;
  if ((topic.confidence ?? 0) < 4) return false;
  return true;
}

export function daysSince(ts: number | null, now = Date.now()): number | null {
  if (!ts) return null;
  return Math.floor((now - ts) / (24 * 60 * 60 * 1000));
}

export function nextReviewLabel(
  nextReviewAt: number | null,
  now = Date.now(),
): { text: string; overdue: boolean } {
  if (!nextReviewAt) return { text: "No review scheduled yet", overdue: false };
  const diffMs = nextReviewAt - now;
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    const over = Math.abs(diffDays);
    return {
      text: over === 1 ? "Overdue by 1 day" : `Overdue by ${over} days`,
      overdue: true,
    };
  }
  if (diffDays === 0) return { text: "Due today", overdue: false };
  if (diffDays === 1) return { text: "Next review tomorrow", overdue: false };
  return { text: `Next review in ${diffDays} days`, overdue: false };
}
