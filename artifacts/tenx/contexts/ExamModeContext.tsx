import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";

const EXAM_MODE_KEY = "tenx.examMode.v2";
const LEGACY_EXAM_MODE_KEY = "tenx.examMode.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export type ExamPhase = "active" | "eve" | "day" | "ended";

export interface ExamModeState {
  examModeActive: boolean;
  examSubjects: string[];
  examDate: number | null;
}

const DEFAULT_STATE: ExamModeState = {
  examModeActive: false,
  examSubjects: [],
  examDate: null,
};

export function computeExamPhase(examDate: number | null, now: number = Date.now()): ExamPhase {
  if (!examDate) return "active";
  // Ended: exam day (23:59:59) has passed
  if (now > examDate) return "ended";
  const startOfExamDay = new Date(examDate);
  startOfExamDay.setHours(0, 0, 0, 0);
  const examDayStart = startOfExamDay.getTime();
  if (now >= examDayStart) return "day";
  const eveDayStart = examDayStart - DAY_MS;
  if (now >= eveDayStart) return "eve";
  return "active";
}

export function daysUntilExamDate(examDate: number | null, now: number = Date.now()): number | null {
  if (!examDate) return null;
  const startOfExamDay = new Date(examDate);
  startOfExamDay.setHours(0, 0, 0, 0);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const diff = startOfExamDay.getTime() - startOfToday.getTime();
  return Math.max(0, Math.ceil(diff / DAY_MS));
}

interface ExamModeContextValue extends ExamModeState {
  examPhase: ExamPhase;
  daysUntilExam: number | null;
  /** Old single-subject compat — first element of examSubjects or "" */
  examSubject: string;
  setExamModeActive: (active: boolean) => Promise<void>;
  setExamSubjects: (subjects: string[]) => Promise<void>;
  setExamDate: (ts: number | null) => Promise<void>;
  /** Atomic: sets active + subjects + date in one persist */
  activateExamMode: (subjects: string[], date: number) => Promise<void>;
  /** Clears everything */
  deactivateExamMode: () => Promise<void>;
}

const ExamModeContext = createContext<ExamModeContextValue | null>(null);

export function ExamModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ExamModeState>(DEFAULT_STATE);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(EXAM_MODE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ExamModeState;
          if (parsed && typeof parsed === "object") setState(parsed);
          return;
        }
        // Migrate v1 → v2
        const legacyRaw = await AsyncStorage.getItem(LEGACY_EXAM_MODE_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw) as { examModeActive?: boolean; examSubject?: string; examDate?: number | null };
          const migrated: ExamModeState = {
            examModeActive: legacy.examModeActive ?? false,
            examSubjects: legacy.examSubject ? [legacy.examSubject] : [],
            examDate: legacy.examDate ?? null,
          };
          setState(migrated);
          await AsyncStorage.setItem(EXAM_MODE_KEY, JSON.stringify(migrated)).catch(() => {});
        }
      } catch {
        // Corrupted storage or parse error — start from default state
      }
    })();
  }, []);

  const persist = useCallback(async (next: ExamModeState) => {
    setState(next);
    try {
      await AsyncStorage.setItem(EXAM_MODE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn("[TenX] ExamMode persist failed:", err);
    }
  }, []);

  // Note: auto-deactivation when exam ends is handled by ExamLifecycleBridge in _layout.tsx
  // (which can atomically call restoreSuspendedSubjects + deactivateExamMode).

  const setExamModeActive = useCallback(
    async (active: boolean) => {
      let next!: ExamModeState;
      setState((prev) => {
        next = { ...prev, examModeActive: active };
        return next;
      });
      await persist(next);
    },
    [persist],
  );

  const setExamSubjects = useCallback(
    async (subjects: string[]) => {
      let next!: ExamModeState;
      setState((prev) => {
        next = { ...prev, examSubjects: subjects };
        return next;
      });
      await persist(next);
    },
    [persist],
  );

  const setExamDate = useCallback(
    async (ts: number | null) => {
      let next!: ExamModeState;
      setState((prev) => {
        next = { ...prev, examDate: ts };
        return next;
      });
      await persist(next);
    },
    [persist],
  );

  const activateExamMode = useCallback(
    async (subjects: string[], date: number) => {
      const next: ExamModeState = {
        examModeActive: true,
        examSubjects: subjects,
        examDate: date,
      };
      await persist(next);
    },
    [persist],
  );

  const deactivateExamMode = useCallback(async () => {
    await persist(DEFAULT_STATE);
  }, [persist]);

  const examPhase = useMemo(
    () => (state.examModeActive ? computeExamPhase(state.examDate) : "active"),
    [state.examModeActive, state.examDate],
  );

  const daysUntilExam = useMemo(
    () => (state.examModeActive ? daysUntilExamDate(state.examDate) : null),
    [state.examModeActive, state.examDate],
  );

  const examSubject = state.examSubjects[0] ?? "";

  const value = useMemo<ExamModeContextValue>(
    () => ({
      ...state,
      examPhase,
      daysUntilExam,
      examSubject,
      setExamModeActive,
      setExamSubjects,
      setExamDate,
      activateExamMode,
      deactivateExamMode,
    }),
    [state, examPhase, daysUntilExam, examSubject, setExamModeActive, setExamSubjects, setExamDate, activateExamMode, deactivateExamMode],
  );

  return (
    <ExamModeContext.Provider value={value}>{children}</ExamModeContext.Provider>
  );
}

export function useExamMode(): ExamModeContextValue {
  const ctx = useContext(ExamModeContext);
  if (!ctx) throw new Error("useExamMode must be used within an ExamModeProvider");
  return ctx;
}
