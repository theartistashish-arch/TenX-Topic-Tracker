import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { getUserData, setUserData } from "@/lib/firestore";
import { useSubscription } from "@/lib/revenuecat";

/** Key for storing the last successful Firestore topics sync timestamp. */
const LAST_SYNC_KEY = "tenx.topics.lastSyncAt";
/** Re-fetch from Firestore at most once per hour — local writes keep AsyncStorage current. */
const SYNC_TTL_MS = 60 * 60 * 1000;

export const FREE_SUBJECT_LIMIT = 2;
export const FREE_TOPIC_LIMIT = 10;

export type Difficulty = "easy" | "medium" | "hard";

export interface StudySession {
  id: string;
  startedAt: number;
  minutes: number;
  difficulty: Difficulty;
  /** Days overdue at the moment this session was logged (0 = on time / first session). */
  daysOverdueAtStart: number;
  /** Effective interval (days) actually scheduled after all caps. */
  effectiveDays: number;
  /** Interval (days) the SM-2 algorithm produced before any caps. */
  requestedDays: number;
  /** How many times the user paused the focus timer during this session. */
  pauseCount?: number;
}

export interface Topic {
  id: string;
  userId: string;
  subject: string;
  topicName: string;
  createdAt: number;
  totalMinutesStudied: number;
  lastStudiedAt: number | null;
  nextReviewAt: number | null;
  sessions: StudySession[];
  confidence?: number;
  disabled?: boolean;
  /** Marked as very important in Exam mode — triggers priority scheduling until examDate. */
  isImportant?: boolean;
  /**
   * Exam Mode suspension: topic is hidden from the revision queue until this timestamp.
   * Set when the user activates Exam Mode for subjects other than the selected ones.
   * Cleared when Exam Mode is deactivated (manually or auto-expired).
   */
  suspendedUntil?: number;
  /**
   * Timestamp when this topic was suspended (set alongside suspendedUntil).
   * Used to compute suspension duration for accurate schedule-shift on restore.
   */
  suspendedAt?: number;

  // ── Spaced-Repetition state (SM-2 style) ─────────────────────────────────
  /** Current interval in days. Defaults to 1 on first use. */
  srInterval?: number;
  /** Ease factor controlling how fast intervals grow. Range 1.3–∞, default 2.5. */
  srEaseFactor?: number;
  /** How many consecutive non-Hard reviews this topic has. Resets to 0 on Hard. */
  srRepetitionCount?: number;
}

export interface RecordSessionResult {
  topic: Topic;
  requestedDays: number;
  effectiveDays: number;
  gapPenaltyApplied: boolean;
  daysOverdue: number;
}

/** Result returned by computeSR. */
export interface SRSchedule {
  /** New repetition count after this review. */
  newRepetitionCount: number;
  /** Updated ease factor after this review. */
  newEaseFactor: number;
  /** New interval in days (SM-2 output, before any exam cap). */
  newInterval: number;
  /** Days the topic was overdue at review time. */
  daysOverdue: number;
  /** Alias of newInterval — the raw SM-2 result before caps. */
  requestedDays: number;
  /** Final scheduled days after exam cap. */
  effectiveDays: number;
  /** Always false — Gap Logic replaced by SM-2 difficulty. */
  gapPenaltyApplied: false;
}

export type AddTopicGateResult =
  | { allowed: true }
  | { allowed: false; reason: "subject_limit" | "topic_limit" };

interface TopicsContextValue {
  topics: Topic[];
  isLoading: boolean;
  getTopic: (id: string) => Topic | null;
  /** Returns null when the free-tier gate is hit; check addTopicGate first to show paywall. */
  addTopic: (input: { subject: string; topicName: string; bypassGate?: boolean }) => Promise<Topic | null>;
  /** Checks whether a new topic with the given subject would be allowed under the current plan. */
  checkAddTopicGate: (subject: string) => AddTopicGateResult;
  recordSession: (input: {
    topicId: string;
    minutes: number;
    difficulty: Difficulty;
    pauseCount?: number;
    /**
     * Exam Mode context. When provided and the topic is starred + in exam subjects,
     * the interval is capped to 1 day so the topic resurfaces daily until the exam.
     */
    examContext?: { active: boolean; subjects: string[]; date: number | null };
  }) => Promise<RecordSessionResult | null>;
  updateTopicMeta: (id: string, patch: { confidence?: number; disabled?: boolean; isImportant?: boolean }) => Promise<void>;
  renameSubject: (oldSubject: string, newSubject: string) => Promise<void>;
  renameTopic: (id: string, newTopicName: string) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
  deleteSubject: (subject: string) => Promise<void>;
  clearAllTopics: () => Promise<void>;
  /**
   * Suspend topics belonging to non-exam subjects.
   * Sets suspendedUntil = examEndsAt and suspendedAt = now on each affected topic.
   */
  suspendExamSubjects: (nonExamSubjects: string[], examEndsAt: number) => Promise<void>;
  /**
   * Restore previously suspended topics.
   * Shifts nextReviewAt forward by the true suspension duration to preserve
   * the relative schedule, preventing overdue floods.
   */
  restoreSuspendedSubjects: () => Promise<void>;
  /**
   * Atomic reconfiguration: restore all currently suspended topics (with schedule shift),
   * then suspend the new set of non-exam subjects.
   * Use this instead of calling restoreSuspendedSubjects + suspendExamSubjects separately
   * to avoid stale-closure issues on consecutive async calls.
   */
  reconfigureExamSubjects: (nonExamSubjects: string[], examEndsAt: number) => Promise<void>;
  /**
   * Catch-up Mode: apply a batch of synthetic nextReviewAt values generated by
   * buildCatchupPlan(). Topics not listed in `changes` are untouched.
   */
  rescheduleTopics: (changes: { topicId: string; nextReviewAt: number }[]) => Promise<void>;
  /**
   * Vacation Mode resume: shift every topic's nextReviewAt forward by `pausedMs`
   * so nothing accumulates as overdue during a planned break.
   */
  shiftAllDueDates: (pausedMs: number) => Promise<void>;
}

const TOPICS_KEY = "tenx.topics.v2";
const LEGACY_TOPICS_KEY = "tenx.topics.v1";

const DAY_MS = 24 * 60 * 60 * 1000;

const SR_DEFAULT_INTERVAL = 1;
const SR_DEFAULT_EASE = 2.5;
const SR_MIN_INTERVAL = 1;
const SR_MAX_INTERVAL = 90;

const TopicsContext = createContext<TopicsContextValue | null>(null);

interface LegacyTopic {
  id: string;
  userId: string;
  subject: string;
  topicName: string;
  createdAt: number;
}

async function loadAll(): Promise<Topic[]> {
  const raw = await AsyncStorage.getItem(TOPICS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Topic[];
    } catch {
      return [];
    }
  }
  const legacyRaw = await AsyncStorage.getItem(LEGACY_TOPICS_KEY);
  if (!legacyRaw) return [];
  try {
    const legacy = JSON.parse(legacyRaw) as LegacyTopic[];
    return legacy.map((t) => ({
      ...t,
      totalMinutesStudied: 0,
      lastStudiedAt: null,
      nextReviewAt: null,
      sessions: [],
    }));
  } catch {
    return [];
  }
}

/**
 * SM-2 style spaced-repetition scheduling.
 *
 * First revision (repetitionCount === 0):
 *   Easy   → interval = 3, repetitionCount = 1
 *   Medium → interval = 2, repetitionCount = 1
 *   Hard   → interval = 1, repetitionCount stays at 0
 *
 * Subsequent revisions:
 *   Easy   → interval = round(prev * 1.8),  easeFactor += 0.1, repetitionCount += 1
 *   Medium → interval = round(prev * 1.4),  easeFactor unchanged, repetitionCount += 1
 *   Hard   → interval = 1,                  easeFactor = max(1.3, ef − 0.2), repetitionCount = 0
 *
 * Bounds: interval clamped to [1, 90] days.
 */
export function computeSR(
  difficulty: Difficulty,
  srState: { interval: number; easeFactor: number; repetitionCount: number },
  prevNextReviewAt: number | null,
  now: number = Date.now(),
): SRSchedule {
  const { interval, easeFactor, repetitionCount } = srState;

  let newRepetitionCount: number;
  let newEaseFactor = easeFactor;
  let newInterval: number;

  if (repetitionCount === 0) {
    if (difficulty === "easy") {
      newInterval = 3;
      newRepetitionCount = 1;
    } else if (difficulty === "medium") {
      newInterval = 2;
      newRepetitionCount = 1;
    } else {
      newInterval = 1;
      newRepetitionCount = 0;
    }
  } else {
    if (difficulty === "easy") {
      newRepetitionCount = repetitionCount + 1;
      newInterval = Math.round(interval * 1.8);
      newEaseFactor = easeFactor + 0.1;
    } else if (difficulty === "medium") {
      newRepetitionCount = repetitionCount + 1;
      newInterval = Math.round(interval * 1.4);
    } else {
      newRepetitionCount = 0;
      newInterval = 1;
      newEaseFactor = Math.max(1.3, easeFactor - 0.2);
    }
  }

  newInterval = Math.max(SR_MIN_INTERVAL, Math.min(SR_MAX_INTERVAL, newInterval));

  const daysOverdue =
    prevNextReviewAt && prevNextReviewAt < now
      ? Math.floor((now - prevNextReviewAt) / DAY_MS)
      : 0;

  return {
    newRepetitionCount,
    newEaseFactor,
    newInterval,
    daysOverdue,
    requestedDays: newInterval,
    effectiveDays: newInterval,
    gapPenaltyApplied: false,
  };
}

export function TopicsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { isPro, isCustomerInfoLoading } = useSubscription();
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ── Smart read caching ────────────────────────────────────────────────────
  // On mount: check AsyncStorage first. Only hit Firestore if we haven't
  // synced in the last 5 minutes OR if the user just logged in (currentUser
  // changed from null). This avoids a Firestore read on every cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let data: Topic[] = [];
        const localRaw = await AsyncStorage.getItem(TOPICS_KEY);
        const lastSyncRaw = await AsyncStorage.getItem(LAST_SYNC_KEY);
        const lastSync = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;
        const fresh = Date.now() - lastSync < SYNC_TTL_MS;

        if (currentUser) {
          if (!fresh) {
            const cloud = await getUserData(currentUser.id, "topics");
            if (cloud && Array.isArray(cloud.topics)) {
              data = cloud.topics as Topic[];
              // Seed dirty-check ref so the first flush after a cloud read
              // doesn't write back identical data.
              lastSyncedJsonRef.current = JSON.stringify(data);
            }
          }
        }
        if (data.length === 0 && localRaw) {
          try {
            const parsed = JSON.parse(localRaw) as Topic[];
            if (Array.isArray(parsed)) data = parsed;
          } catch {
            // corrupted cache — proceed with empty topics
          }
        }
        if (!cancelled) setAllTopics(data);
      } catch {
        // Unexpected storage or network error — app continues with empty topics
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // ── Debounced Firestore writes ────────────────────────────────────────────────
  // Rapid mutations (e.g. reconfiguring exam subjects + resuming topics)
  // get batched into a single Firestore write instead of N writes.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Topic[] | null>(null);
  // Tracks the JSON of the last data successfully written to Firestore so we
  // can skip the write when the debounce fires but data hasn't actually changed.
  const lastSyncedJsonRef = useRef<string | null>(null);

  const flushPersist = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    const json = JSON.stringify(next);
    await AsyncStorage.setItem(TOPICS_KEY, json);
    if (currentUser && json !== lastSyncedJsonRef.current) {
      try {
        await setUserData(currentUser.id, "topics", { topics: next });
        lastSyncedJsonRef.current = json;
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
      } catch (err) {
        console.warn("[TenX] Firestore topics sync failed:", err);
      }
    }
  }, [currentUser]);

  const persist = useCallback(async (next: Topic[]) => {
    setAllTopics(next);
    pendingRef.current = next;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void flushPersist();
    }, 800);
  }, [flushPersist]);

  // Flush any pending write when provider unmounts so nothing is lost.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingRef.current) {
        void flushPersist();
      }
    };
  }, [flushPersist]);

  const topics = useMemo(
    () =>
      currentUser
        ? allTopics
            .filter((t) => t.userId === currentUser.id)
            .sort((a, b) => b.createdAt - a.createdAt)
        : [],
    [allTopics, currentUser],
  );

  const getTopic = useCallback(
    (id: string) => allTopics.find((t) => t.id === id) ?? null,
    [allTopics],
  );

  const checkAddTopicGate = useCallback<TopicsContextValue["checkAddTopicGate"]>(
    (subject: string) => {
      // Allow through if Pro — or while we're still determining Pro status
      // (cache loading / RC network request in-flight). This prevents Pro
      // subscribers from being incorrectly blocked at startup.
      if (isPro || isCustomerInfoLoading) return { allowed: true };
      const userTopics = currentUser
        ? allTopics.filter((t) => t.userId === currentUser.id)
        : [];
      const cleanSubject = subject.trim();
      const uniqueSubjects = new Set(userTopics.map((t) => t.subject));
      const isNewSubject = !uniqueSubjects.has(cleanSubject);
      if (isNewSubject && uniqueSubjects.size >= FREE_SUBJECT_LIMIT) {
        return { allowed: false, reason: "subject_limit" };
      }
      const topicsInSubject = userTopics.filter((t) => t.subject === cleanSubject);
      if (topicsInSubject.length >= FREE_TOPIC_LIMIT) {
        return { allowed: false, reason: "topic_limit" };
      }
      return { allowed: true };
    },
    [isPro, isCustomerInfoLoading, allTopics, currentUser],
  );

  const addTopic = useCallback<TopicsContextValue["addTopic"]>(
    async ({ subject, topicName, bypassGate }) => {
      if (!currentUser) return null;
      const cleanSubject = subject.trim();
      const cleanName = topicName.trim();
      if (!cleanSubject || !cleanName) return null;
      if (!bypassGate) {
        const gate = checkAddTopicGate(cleanSubject);
        if (!gate.allowed) return null;
      }
      const t: Topic = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
        userId: currentUser.id,
        subject: cleanSubject,
        topicName: cleanName,
        createdAt: Date.now(),
        totalMinutesStudied: 0,
        lastStudiedAt: null,
        nextReviewAt: null,
        sessions: [],
        srInterval: SR_DEFAULT_INTERVAL,
        srEaseFactor: SR_DEFAULT_EASE,
        srRepetitionCount: 0,
      };
      const next = [t, ...allTopics];
      try {
        await persist(next);
        return t;
      } catch (err) {
        console.warn("[TenX] addTopic persist failed, saving locally only:", err);
        setAllTopics(next);
        return t;
      }
    },
    [allTopics, currentUser, persist, checkAddTopicGate],
  );

  const recordSession = useCallback<TopicsContextValue["recordSession"]>(
    async ({ topicId, minutes, difficulty, pauseCount, examContext }) => {
      const idx = allTopics.findIndex((t) => t.id === topicId);
      if (idx < 0) return null;
      const existing = allTopics[idx]!;
      const now = Date.now();

      const srState = {
        interval: existing.srInterval ?? SR_DEFAULT_INTERVAL,
        easeFactor: existing.srEaseFactor ?? SR_DEFAULT_EASE,
        repetitionCount: existing.srRepetitionCount ?? 0,
      };

      const srResult = computeSR(difficulty, srState, existing.nextReviewAt, now);

      // Exam Mode priority cap: starred topic in an active exam subject → cap to 1 day.
      const examCapActive =
        !!examContext?.active &&
        !!existing.isImportant &&
        examContext.subjects.includes(existing.subject) &&
        examContext.date !== null &&
        now < examContext.date;

      const effectiveDays = examCapActive
        ? Math.min(srResult.effectiveDays, 1)
        : srResult.effectiveDays;

      const session: StudySession = {
        id: now.toString() + Math.random().toString(36).slice(2, 9),
        startedAt: now,
        minutes,
        difficulty,
        daysOverdueAtStart: srResult.daysOverdue,
        effectiveDays,
        requestedDays: srResult.requestedDays,
        pauseCount: typeof pauseCount === "number" ? Math.max(0, pauseCount) : 0,
      };

      const updated: Topic = {
        ...existing,
        totalMinutesStudied: (existing.totalMinutesStudied ?? 0) + minutes,
        lastStudiedAt: now,
        nextReviewAt: now + effectiveDays * DAY_MS,
        sessions: [session, ...(existing.sessions ?? [])],
        srInterval: srResult.newInterval,
        srEaseFactor: srResult.newEaseFactor,
        srRepetitionCount: srResult.newRepetitionCount,
      };

      const next = [...allTopics];
      next[idx] = updated;
      await persist(next);

      return {
        topic: updated,
        requestedDays: srResult.requestedDays,
        effectiveDays,
        gapPenaltyApplied: false,
        daysOverdue: srResult.daysOverdue,
      };
    },
    [allTopics, persist],
  );

  const updateTopicMeta = useCallback(
    async (id: string, patch: { confidence?: number; disabled?: boolean; isImportant?: boolean }) => {
      const idx = allTopics.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const next = [...allTopics];
      next[idx] = { ...next[idx]!, ...patch };
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] updateTopicMeta persist failed, saving locally only:", err);
        setAllTopics(next);
      }
    },
    [allTopics, persist],
  );

  const renameSubject = useCallback(
    async (oldSubject: string, newSubject: string) => {
      const trimmed = newSubject.trim();
      if (!trimmed || trimmed === oldSubject) return;
      const next = allTopics.map((t) =>
        t.subject === oldSubject ? { ...t, subject: trimmed } : t,
      );
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] renameSubject persist failed, saving locally only:", err);
        setAllTopics(next);
      }
    },
    [allTopics, persist],
  );

  const renameTopic = useCallback(
    async (id: string, newTopicName: string) => {
      const trimmed = newTopicName.trim();
      if (!trimmed) return;
      const idx = allTopics.findIndex((t) => t.id === id);
      if (idx < 0) return;
      if (allTopics[idx]!.topicName === trimmed) return;
      const next = [...allTopics];
      next[idx] = { ...next[idx]!, topicName: trimmed };
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] renameTopic persist failed, saving locally only:", err);
        setAllTopics(next);
      }
    },
    [allTopics, persist],
  );

  const deleteTopic = useCallback(async (id: string) => {
    const next = allTopics.filter((t) => t.id !== id);
    try {
      await persist(next);
    } catch (err) {
      console.warn("[TenX] deleteTopic persist failed, saving locally only:", err);
      setAllTopics(next);
    }
  }, [allTopics, persist]);

  const deleteSubject = useCallback(async (subject: string) => {
    if (!currentUser) return;
    const next = allTopics.filter(
      (t) => !(t.userId === currentUser.id && t.subject === subject),
    );
    try {
      await persist(next);
    } catch (err) {
      console.warn("[TenX] deleteSubject persist failed, saving locally only:", err);
      setAllTopics(next);
    }
  }, [allTopics, currentUser, persist]);

  const clearAllTopics = useCallback(async () => {
    if (!currentUser) return;
    const remaining = allTopics.filter((t) => t.userId !== currentUser.id);
    try {
      await persist(remaining);
    } catch (err) {
      console.warn("[TenX] clearAllTopics persist failed, saving locally only:", err);
      setAllTopics(remaining);
    }
  }, [allTopics, currentUser, persist]);

  const suspendExamSubjects = useCallback(
    async (nonExamSubjects: string[], examEndsAt: number) => {
      if (!currentUser) return;
      const now = Date.now();
      const next = allTopics.map((t) => {
        if (t.userId !== currentUser.id) return t;
        if (!nonExamSubjects.includes(t.subject)) return t;
        return { ...t, suspendedUntil: examEndsAt, suspendedAt: now };
      });
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] suspendExamSubjects persist failed:", err);
        setAllTopics(next);
      }
    },
    [allTopics, currentUser, persist],
  );

  const restoreSuspendedSubjects = useCallback(async () => {
    if (!currentUser) return;
    const now = Date.now();
    const next = allTopics.map((t) => {
      if (t.userId !== currentUser.id) return t;
      if (!t.suspendedUntil) return t;
      // Shift nextReviewAt forward by the true suspension duration to preserve
      // the relative schedule (prevents topics bunching as overdue all at once)
      const suspensionDuration = now - (t.suspendedAt ?? now);
      const newNextReviewAt =
        t.nextReviewAt !== null
          ? Math.max(t.nextReviewAt + suspensionDuration, now)
          : null;
      const { suspendedUntil: _su, suspendedAt: _sa, ...rest } = t;
      void _su; void _sa;
      return { ...rest, nextReviewAt: newNextReviewAt };
    });
    try {
      await persist(next);
    } catch (err) {
      console.warn("[TenX] restoreSuspendedSubjects persist failed:", err);
      setAllTopics(next);
    }
  }, [allTopics, currentUser, persist]);

  /**
   * Atomic reconfiguration: restores all currently suspended topics (with schedule shift)
   * then suspends the new set of non-exam subjects — all in a single persist call.
   * Avoids stale-closure issues that arise from chaining separate async calls.
   */
  const rescheduleTopics = useCallback(
    async (changes: { topicId: string; nextReviewAt: number }[]) => {
      if (changes.length === 0) return;
      const map = new Map(changes.map((c) => [c.topicId, c.nextReviewAt]));
      const next = allTopics.map((t) => {
        const newDate = map.get(t.id);
        if (newDate === undefined) return t;
        return { ...t, nextReviewAt: newDate };
      });
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] rescheduleTopics persist failed:", err);
        setAllTopics(next);
      }
    },
    [allTopics, persist],
  );

  const shiftAllDueDates = useCallback(
    async (pausedMs: number) => {
      if (!currentUser || pausedMs <= 0) return;
      const next = allTopics.map((t) => {
        if (t.userId !== currentUser.id) return t;
        if (t.nextReviewAt === null) return t;
        return { ...t, nextReviewAt: t.nextReviewAt + pausedMs };
      });
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] shiftAllDueDates persist failed:", err);
        setAllTopics(next);
      }
    },
    [allTopics, currentUser, persist],
  );

  const reconfigureExamSubjects = useCallback(
    async (nonExamSubjects: string[], examEndsAt: number) => {
      if (!currentUser) return;
      const now = Date.now();
      const next = allTopics.map((t) => {
        if (t.userId !== currentUser.id) return t;
        if (t.suspendedUntil) {
          // Restore: shift nextReviewAt forward by true suspension duration
          const suspensionDuration = now - (t.suspendedAt ?? now);
          const restored =
            t.nextReviewAt !== null
              ? Math.max(t.nextReviewAt + suspensionDuration, now)
              : null;
          const { suspendedUntil: _su, suspendedAt: _sa, ...rest } = t;
          void _su; void _sa;
          if (nonExamSubjects.includes(t.subject)) {
            // Still non-exam: re-suspend with fresh timestamp
            return { ...rest, nextReviewAt: restored, suspendedUntil: examEndsAt, suspendedAt: now };
          }
          // Now in exam scope: restore fully
          return { ...rest, nextReviewAt: restored };
        }
        // Not currently suspended
        if (nonExamSubjects.includes(t.subject)) {
          return { ...t, suspendedUntil: examEndsAt, suspendedAt: now };
        }
        return t;
      });
      try {
        await persist(next);
      } catch (err) {
        console.warn("[TenX] reconfigureExamSubjects persist failed:", err);
        setAllTopics(next);
      }
    },
    [allTopics, currentUser, persist],
  );

  const value = useMemo<TopicsContextValue>(
    () => ({
      topics,
      isLoading,
      getTopic,
      addTopic,
      checkAddTopicGate,
      recordSession,
      updateTopicMeta,
      renameSubject,
      renameTopic,
      deleteTopic,
      deleteSubject,
      clearAllTopics,
      suspendExamSubjects,
      restoreSuspendedSubjects,
      reconfigureExamSubjects,
      rescheduleTopics,
      shiftAllDueDates,
    }),
    [topics, isLoading, getTopic, addTopic, checkAddTopicGate, recordSession, updateTopicMeta, renameSubject, renameTopic, deleteTopic, deleteSubject, clearAllTopics, suspendExamSubjects, restoreSuspendedSubjects, reconfigureExamSubjects, rescheduleTopics, shiftAllDueDates],
  );

  return (
    <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>
  );
}

export function useTopics(): TopicsContextValue {
  const ctx = useContext(TopicsContext);
  if (!ctx) throw new Error("useTopics must be used within a TopicsProvider");
  return ctx;
}

function endOfTodayMs(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfTodayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** True when the next review is scheduled today or earlier (includes overdue).
 *  Suspended topics are always treated as not-due. */
export function isDueToday(topic: Topic, now: number = Date.now()): boolean {
  if (!topic.nextReviewAt) return false;
  if (topic.suspendedUntil && topic.suspendedUntil > now) return false;
  return topic.nextReviewAt <= endOfTodayMs(now);
}

/** True only when the next review was scheduled before today.
 *  Suspended topics are always treated as not-overdue. */
export function isOverdue(topic: Topic, now: number = Date.now()): boolean {
  if (!topic.nextReviewAt) return false;
  if (topic.suspendedUntil && topic.suspendedUntil > now) return false;
  return topic.nextReviewAt < startOfTodayMs(now);
}

/** Whole days the topic is overdue (0 if not overdue or never scheduled). */
export function daysOverdueOf(topic: Topic, now: number = Date.now()): number {
  if (!topic.nextReviewAt) return 0;
  if (topic.suspendedUntil && topic.suspendedUntil > now) return 0;
  const start = startOfTodayMs(now);
  if (topic.nextReviewAt >= start) return 0;
  return Math.max(1, Math.floor((start - topic.nextReviewAt) / DAY_MS));
}
