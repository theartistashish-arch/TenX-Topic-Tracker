import { Topic } from "@/contexts/TopicsContext";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function buildStreak(topics: Topic[], now: number = Date.now()): number {
  const days = new Set<number>();
  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      days.add(startOfDay(s.startedAt));
    }
  }
  let streak = 0;
  let cursor = startOfDay(now);
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 24 * 60 * 60 * 1000;
  }
  return streak;
}
