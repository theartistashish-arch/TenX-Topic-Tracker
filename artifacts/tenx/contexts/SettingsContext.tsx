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

const LAST_SYNC_KEY = "tenx.settings.lastSyncAt";

export type ThemePref = "light" | "dark";

export interface UserSettings {
  /** Daily study budget in minutes used to plan today's revision. */
  dailyBudgetMin: number;
  /** Default focus block length in minutes. */
  focusMinutes: number;
  /** Default break length in minutes. */
  breakMinutes: number;
  /** Weekly study goal in minutes. */
  weeklyGoalMin: number;
  /** Haptic feedback toggle. */
  hapticsEnabled: boolean;
  /** Chime / sound feedback toggle. */
  soundEnabled: boolean;
  /** Master toggle for all revision reminder notifications. */
  remindersEnabled: boolean;
  /** Send a morning reminder (08:00) when topics are due. */
  morningReminderEnabled: boolean;
  /** Send an evening reminder (19:00) when topics are due. */
  eveningReminderEnabled: boolean;
  /** Alert in the evening when a streak may be lost. */
  streakAlertsEnabled: boolean;
  /** Send low-priority motivational / retention insights. */
  motivationalInsightsEnabled: boolean;
  /** Whether the break timer should start automatically after focus ends. */
  autoStartBreak: boolean;
  /** Number of pauses in a single focus block before showing a warning. */
  pauseWarnAt: number;
  /** Theme preference (UI only — followed where supported). */
  theme: ThemePref;
  /**
   * Vacation / Pause Mode timestamp.
   * Non-null while the schedule is frozen. Stores the moment the user
   * activated the pause so the duration can be computed on resume.
   * On resume, every topic's nextReviewAt is shifted forward by the
   * pause duration so nothing accumulates.
   */
  vacationSince: number | null;
}

interface SettingsContextValue {
  settings: UserSettings;
  isLoading: boolean;
  setDailyBudgetMin: (mins: number) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dailyBudgetMin: 60,
  focusMinutes: 25,
  breakMinutes: 5,
  weeklyGoalMin: 600,
  hapticsEnabled: true,
  soundEnabled: true,
  remindersEnabled: true,
  morningReminderEnabled: true,
  eveningReminderEnabled: true,
  streakAlertsEnabled: true,
  motivationalInsightsEnabled: false,
  autoStartBreak: false,
  pauseWarnAt: 3,
  theme: "light",
  vacationSince: null,
};

export const MIN_BUDGET_MIN = 15;
export const MAX_BUDGET_MIN = 960;
export const BUDGET_STEP_MIN = 5;

export const MIN_FOCUS_MIN = 5;
export const MAX_FOCUS_MIN = 90;
export const FOCUS_STEP_MIN = 5;

export const MIN_BREAK_MIN = 1;
export const MAX_BREAK_MIN = 30;
export const BREAK_STEP_MIN = 1;

export const MIN_WEEKLY_GOAL_MIN = 60;
export const MAX_WEEKLY_GOAL_MIN = 4200;
export const WEEKLY_GOAL_STEP_MIN = 30;

function settingsKey(userId: string) {
  return `tenx.settings.v2.${userId}`;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ── Smart read caching ──────────────────────────────────────────────────────
  // On mount: check AsyncStorage first. Only hit Firestore if we haven't
  // synced in the last 5 minutes. This avoids a Firestore read on every cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      if (!currentUser) {
        if (!cancelled) {
          setSettings(DEFAULT_SETTINGS);
          setIsLoading(false);
        }
        return;
      }
      try {
        const lastSyncRaw = await AsyncStorage.getItem(LAST_SYNC_KEY);
        const lastSync = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;
        const fresh = Date.now() - lastSync < 5 * 60 * 1000;

        let merged: UserSettings = DEFAULT_SETTINGS;
        const raw = await AsyncStorage.getItem(settingsKey(currentUser.id));
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<UserSettings>;
          merged = normalize({ ...DEFAULT_SETTINGS, ...parsed });
        }

        if (!fresh) {
          const cloud = await getUserData(currentUser.id, "settings");
          if (cloud && cloud.settings) {
            merged = normalize({ ...DEFAULT_SETTINGS, ...(cloud.settings as Partial<UserSettings>) });
            await AsyncStorage.setItem(settingsKey(currentUser.id), JSON.stringify(merged));
          }
        }

        if (!cancelled) setSettings(merged);
      } catch {
        if (!cancelled) setSettings(DEFAULT_SETTINGS);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // ── Debounced Firestore writes ────────────────────────────────────────────────
  // Rapid setting changes (e.g. toggling multiple switches) batch into one write.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<UserSettings | null>(null);

  const flushPersist = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    if (currentUser) {
      await AsyncStorage.setItem(settingsKey(currentUser.id), JSON.stringify(next));
      try {
        await setUserData(currentUser.id, "settings", { settings: next });
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
      } catch (err) {
        console.warn("[TenX] Firestore settings sync failed:", err);
      }
    }
  }, [currentUser]);

  const persist = useCallback(
    async (next: UserSettings) => {
      setSettings(next);
      pendingRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushPersist();
      }, 800);
    },
    [flushPersist],
  );

  // Flush any pending write when provider unmounts so nothing is lost.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingRef.current) {
        void flushPersist();
      }
    };
  }, [flushPersist]);

  const setDailyBudgetMin = useCallback(
    async (mins: number) => {
      await persist(normalize({ ...settings, dailyBudgetMin: mins }));
    },
    [persist, settings],
  );

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      await persist(normalize({ ...settings, ...patch }));
    },
    [persist, settings],
  );

  const resetSettings = useCallback(async () => {
    await persist(DEFAULT_SETTINGS);
  }, [persist]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, isLoading, setDailyBudgetMin, updateSettings, resetSettings }),
    [settings, isLoading, setDailyBudgetMin, updateSettings, resetSettings],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}

function clamp(value: number, min: number, max: number, step: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

function normalize(s: UserSettings): UserSettings {
  return {
    ...s,
    dailyBudgetMin: clamp(s.dailyBudgetMin, MIN_BUDGET_MIN, MAX_BUDGET_MIN, BUDGET_STEP_MIN, DEFAULT_SETTINGS.dailyBudgetMin),
    focusMinutes: clamp(s.focusMinutes, MIN_FOCUS_MIN, MAX_FOCUS_MIN, FOCUS_STEP_MIN, DEFAULT_SETTINGS.focusMinutes),
    breakMinutes: clamp(s.breakMinutes, MIN_BREAK_MIN, MAX_BREAK_MIN, BREAK_STEP_MIN, DEFAULT_SETTINGS.breakMinutes),
    weeklyGoalMin: clamp(s.weeklyGoalMin, MIN_WEEKLY_GOAL_MIN, MAX_WEEKLY_GOAL_MIN, WEEKLY_GOAL_STEP_MIN, DEFAULT_SETTINGS.weeklyGoalMin),
    pauseWarnAt: clamp(s.pauseWarnAt, 1, 10, 1, DEFAULT_SETTINGS.pauseWarnAt),
    theme: (s.theme === "light" || s.theme === "dark") ? s.theme : "light",
    hapticsEnabled: !!s.hapticsEnabled,
    soundEnabled: !!s.soundEnabled,
    remindersEnabled: !!s.remindersEnabled,
    morningReminderEnabled: s.morningReminderEnabled !== false,
    eveningReminderEnabled: s.eveningReminderEnabled !== false,
    streakAlertsEnabled: s.streakAlertsEnabled !== false,
    motivationalInsightsEnabled: !!s.motivationalInsightsEnabled,
    autoStartBreak: !!s.autoStartBreak,
    vacationSince: (typeof s.vacationSince === "number" && Number.isFinite(s.vacationSince))
      ? s.vacationSince
      : null,
  };
}
