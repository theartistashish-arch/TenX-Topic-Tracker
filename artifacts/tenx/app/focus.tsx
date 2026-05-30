import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import { PrimaryButton } from "@/components/PrimaryButton";
import { BreakPopup } from "@/components/BreakPopup";
import { useAds } from "@/lib/ads";
import { BreakTipCarousel } from "@/components/BreakTipCarousel";
import { DndReminderModal, hasDndReminderBeenSeen } from "@/components/DndReminderModal";
import { useExamMode } from "@/contexts/ExamModeContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Difficulty, SRSchedule, computeSR, useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { startAlarm } from "@/lib/feedback";
import { FOCUS_STATE_KEY } from "@/lib/focusStorage";
import {
  TIMER_NOTIF_PREFIX,
  cancelTodayStreakAlert,
  canScheduleExactAlarmsAsync,
  checkAndScheduleMilestoneNotification,
  ensureTimerChannel,
  openExactAlarmSettings,
  scheduleTopicRevisionNotification,
} from "@/lib/notifications";

const ALL_BREAK_TIPS = [
  "Drink water. Small sip, big reset.",
  "Wash your face with cold water.",
  "Do a 20-second eye rest. Look far away.",
  "Roll your shoulders. Keep it easy.",
  "Take 5 slow, deep breaths. Exhale fully.",
  "Stand up and stretch your back gently.",
  "Look at something 20 feet away for 20 seconds.",
  "Gently massage your temples in circles.",
  "Blink slowly 10 times to refresh your eyes.",
  "Walk to another room and back.",
  "Do 10 slow neck rolls, 5 each side.",
  "Put your hands over your eyes for 30 seconds.",
  "Hum a tune to release jaw tension.",
  "Straighten your spine and sit tall.",
  "Clench and release your hands 5 times.",
  "Think of one thing you just learned.",
  "Smile — even faking it lifts your mood.",
  "Appreciate your effort. You showed up today.",
  "Breathe in 4, hold 4, out for 4.",
  "Consistency compounds. You're building it.",
];

const STUDY_QUOTES = [
  "Push through — you're almost there",
  "Focus is your superpower",
  "One topic at a time",
  "Your future self will thank you",
  "Deep work = real results",
  "Stay locked in",
  "Every minute counts",
  "You chose to show up today",
  "Consistency beats talent",
  "Keep going — this is how legends study",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const BREAK_TIP_DURATION_MS = 45000;

const DIFF_TINT: Record<Difficulty, string> = {
  easy: "#22c55e",
  medium: "#f59e0b",
  hard: "#ef4444",
};

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Moderate",
  hard: "Hard",
};

const DIFF_GUIDE: Record<Difficulty, string> = {
  easy: "Recalled well · few facts · familiar concepts",
  medium: "Some effort · moderate recall · a few gaps",
  hard: "Struggled · dense facts · tough concepts",
};

type Phase = "focus" | "break";

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function FocusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const { topics, getTopic, recordSession } = useTopics();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { showRewardedAd, showInterstitialIfDue } = useAds();
  const { examModeActive, examSubjects, examDate } = useExamMode();
  const hapticsOn = settings.hapticsEnabled;
  const soundOn = settings.soundEnabled;
  const breakMinutes = settings.breakMinutes;
  const focusMinutes = settings.focusMinutes;

  const [takingBreak, setTakingBreak] = useState(false);

  const tap = useCallback(() => {
    if (hapticsOn && Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [hapticsOn]);

  const topic = useMemo(
    () => (topicId ? getTopic(topicId) : null),
    [topicId, getTopic],
  );

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const [quote] = useState(() => STUDY_QUOTES[Math.floor(Math.random() * STUDY_QUOTES.length)]!);

  // ── Rating sheet state ─────────────────────────────────────────────────────
  const [showRatingSheet, setShowRatingSheet] = useState(false);
  const [ratingSelected, setRatingSelected] = useState<Difficulty | null>(null);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [pausedBeforeRating, setPausedBeforeRating] = useState(false);
  const [sessionMinutesSnap, setSessionMinutesSnap] = useState(0);

  const srStateSnap = useMemo(() => ({
    interval: topic?.srInterval ?? 1,
    easeFactor: topic?.srEaseFactor ?? 2.5,
    repetitionCount: topic?.srRepetitionCount ?? 0,
  }), [topic?.srInterval, topic?.srEaseFactor, topic?.srRepetitionCount]);

  const srPreviews = useMemo<Record<Difficulty, SRSchedule>>(() => {
    const opts: Difficulty[] = ["easy", "medium", "hard"];
    return opts.reduce((acc, d) => {
      acc[d] = computeSR(d, srStateSnap, topic?.nextReviewAt ?? null, Date.now());
      return acc;
    }, {} as Record<Difficulty, SRSchedule>);
  }, [srStateSnap, topic?.nextReviewAt]);

  const examCapActive =
    examModeActive &&
    !!topic?.isImportant &&
    !!topic?.subject &&
    examSubjects.includes(topic.subject) &&
    examDate !== null &&
    Date.now() < examDate;

  // ── Timer state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState<number>(breakMinutes * 60);
  const [paused, setPaused] = useState<boolean>(true);
  const [pauseCount, setPauseCount] = useState<number>(0);
  const [focusElapsed, setFocusElapsed] = useState<number>(0);
  // Next focusElapsed value at which to trigger a break
  const [focusGoalElapsed, setFocusGoalElapsed] = useState<number>(0);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showBreakPopup, setShowBreakPopup] = useState(false);
  const [showAfterBreakModal, setShowAfterBreakModal] = useState(false);
  const [showDndReminder, setShowDndReminder] = useState(false);
  const [showExactAlarmModal, setShowExactAlarmModal] = useState(false);
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * ALL_BREAK_TIPS.length),
  );
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [wasRestored, setWasRestored] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const autoStartedRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);
  const prevAppState = useRef<AppStateStatus>(AppState.currentState);
  const pulse = useRef(new (require("react-native").Animated.Value)(1)).current;
  // Used to distinguish phone call (inactive stays) from app switch (inactive → background quickly)
  const callDetectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the stop() function for the currently-running alarm loop (break/after-break alert)
  const alarmStopRef = useRef<(() => void) | null>(null);
  // Timestamp when the app was last sent to background while the timer was running.
  const backgroundedAtRef = useRef<number | null>(null);
  // Set to true in the AppState → active handler (before clearing backgroundedAtRef)
  // when the projected elapsed time shows the goal was passed while the screen was off.
  // The goal effects read this to suppress the duplicate in-app alarm (the OS
  // lock-screen notification already alerted the user).
  const goalPassedWhileBackgroundedRef = useRef(false);

  // Keep mutable refs current so AppState handler closure always reads latest values
  const phaseRef = useRef(phase);
  const focusElapsedRef = useRef(focusElapsed);
  const focusGoalElapsedRef = useRef(focusGoalElapsed);
  const remainingRef = useRef(remaining);
  const pauseCountRef = useRef(pauseCount);
  const pausedRef = useRef(paused);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { focusElapsedRef.current = focusElapsed; }, [focusElapsed]);
  useEffect(() => { focusGoalElapsedRef.current = focusGoalElapsed; }, [focusGoalElapsed]);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);
  useEffect(() => { pauseCountRef.current = pauseCount; }, [pauseCount]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ── Restore state from AsyncStorage on mount ───────────────────────────────
  useEffect(() => {
    if (!topicId) {
      setRestoreChecked(true);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FOCUS_STATE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            topicId: string;
            phase: Phase;
            focusElapsed: number;
            focusGoalElapsed: number;
            remaining: number;
            pauseCount: number;
            // savedAt is non-null only when app was backgrounded (not a call or deliberate exit)
            // On crash-recovery: add wall-clock time since savedAt to elapsed
            savedAt: number | null;
            pausedByCall: boolean;
          };
          if (saved.topicId === topicId) {
            await AsyncStorage.removeItem(FOCUS_STATE_KEY);
            // Add wall-clock elapsed only when app crashed while timer was running in background
            const wallElapsed =
              saved.savedAt !== null && !saved.pausedByCall
                ? Math.max(0, (Date.now() - saved.savedAt) / 1000)
                : 0;
            if (saved.phase === "focus") {
              setFocusElapsed(saved.focusElapsed + wallElapsed);
              setFocusGoalElapsed(saved.focusGoalElapsed);
              setPhase("focus");
            } else {
              setFocusElapsed(saved.focusElapsed);
              setFocusGoalElapsed(saved.focusGoalElapsed);
              const newRemaining = Math.max(0, saved.remaining - wallElapsed);
              setRemaining(newRemaining);
              setPhase("break");
              if (newRemaining <= 0) {
                setShowAfterBreakModal(true);
              }
            }
            setPauseCount(saved.pauseCount);
            setPaused(true);
            setWasRestored(true);
          }
        }
      } catch {
        // ignore errors
      } finally {
        setRestoreChecked(true);
      }
    })();
  }, [topicId]);

  // ── AppState: smart background/call handling ───────────────────────────────
  //
  // iOS app switches fire: active → inactive → background (within ~300 ms).
  // Phone calls fire:       active → inactive  (stays inactive during the call).
  // Android app switches:  active → background (no inactive step).
  //
  // Strategy:
  //   • active → inactive  : start a 400 ms timer. If background fires before it
  //     expires we know it was an app switch (cancel timer, don't pause).
  //     If the timer fires first it's a phone call → pause + save.
  //   • active → background : cancel any pending call timer; save for crash-recovery
  //     with savedAt=now (when running) but do NOT pause — lastTickRef naturally
  //     accumulates the gap when the app returns to the foreground.
  //   • * → active          : cancel any pending call timer (notification dismissed);
  //     update AsyncStorage with current state so crash-recovery reflects the time
  //     the app was last known to be in the foreground (savedAt=null prevents
  //     double-counting background time already captured by lastTickRef).
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const buildPayload = (opts: { savedAt: number | null; pausedByCall: boolean }) => ({
      topicId,
      phase: phaseRef.current,
      focusElapsed: focusElapsedRef.current,
      focusGoalElapsed: focusGoalElapsedRef.current,
      remaining: remainingRef.current,
      pauseCount: pauseCountRef.current,
      ...opts,
    });

    const cancelCallTimer = () => {
      if (callDetectTimerRef.current !== null) {
        clearTimeout(callDetectTimerRef.current);
        callDetectTimerRef.current = null;
      }
    };

    const subscription = AppState.addEventListener("change", (nextState) => {
      const prev = prevAppState.current;

      // Always cancel a pending call-detection timer on any transition
      cancelCallTimer();

      // ── active → inactive ──────────────────────────────────────────────
      // Could be the start of an iOS app switch OR a phone call.
      // Wait 400 ms: if background fires first the timer gets cancelled (app switch).
      if (prev === "active" && nextState === "inactive") {
        callDetectTimerRef.current = setTimeout(() => {
          callDetectTimerRef.current = null;
          // Still inactive after 400 ms → confirmed phone call / system sheet
          if (!pausedRef.current) {
            setPaused(true);
          }
          AsyncStorage.setItem(
            FOCUS_STATE_KEY,
            JSON.stringify(buildPayload({
              savedAt: null,         // don't count call time on crash-restore
              pausedByCall: true,
            })),
          ).catch(() => {});
        }, 400);
      }

      // ── active → background ────────────────────────────────────────────
      // App switch (Android direct, or iOS after inactive). Don't pause —
      // lastTickRef will bridge the gap on the next tick after returning.
      if (nextState === "background") {
        const wasRunning = !pausedRef.current;
        AsyncStorage.setItem(
          FOCUS_STATE_KEY,
          JSON.stringify(buildPayload({
            // savedAt is non-null only when timer was running; crash-recovery
            // uses it to add wall-clock elapsed when the app is re-launched.
            savedAt: wasRunning ? Date.now() : null,
            pausedByCall: false,
          })),
        ).catch(() => {});
        // Track that we were backgrounded while running so that, if the goal
        // was reached while the screen was off, we can skip the duplicate
        // in-app alarm on return (the OS notification already alerted the user).
        if (wasRunning) {
          backgroundedAtRef.current = Date.now();
        }
        // Do NOT set paused — the interval's lastTickRef handles elapsed accumulation
      }

      // ── * → active ─────────────────────────────────────────────────────
      // Returning from background (app switch) or after a call ended.
      // • Background case: timer was never paused; lastTickRef delta handles
      //   elapsed. Update AsyncStorage so a crash now doesn't double-count.
      // • Call case: timer was paused; user taps Resume themselves.
      if (nextState === "active") {
        if (prev === "background") {
          // Before clearing backgroundedAtRef, project whether the timer goal
          // was reached while the screen was off. The goal effects run after
          // React re-renders (which happen after this synchronous callback), so
          // by the time they execute backgroundedAtRef would already be null —
          // that race condition is why we set goalPassedWhileBackgroundedRef here
          // instead of relying on backgroundedAtRef inside the effects.
          const bgAt = backgroundedAtRef.current;
          if (bgAt !== null && !pausedRef.current) {
            const wallElapsed = (Date.now() - bgAt) / 1000;
            if (
              phaseRef.current === "focus" &&
              focusGoalElapsedRef.current > 0 &&
              focusElapsedRef.current + wallElapsed >= focusGoalElapsedRef.current
            ) {
              goalPassedWhileBackgroundedRef.current = true;
            } else if (
              phaseRef.current === "break" &&
              remainingRef.current - wallElapsed <= 0
            ) {
              goalPassedWhileBackgroundedRef.current = true;
            }
          }
          // Re-persist current state with savedAt=null — prevents crash-recovery
          // from adding the already-accounted-for background time again.
          AsyncStorage.setItem(
            FOCUS_STATE_KEY,
            JSON.stringify(buildPayload({
              savedAt: null,
              pausedByCall: false,
            })),
          ).catch(() => {});
        }
        // For prev === "inactive" (call ended): timer is already paused; no action needed.
        backgroundedAtRef.current = null;
      }

      prevAppState.current = nextState;
    });

    return () => {
      subscription.remove();
      cancelCallTimer();
    };
  }, [topicId]);

  // ── Local notification helpers (screen-off alarm) ──────────────────────────
  // When the screen turns off JS is suspended. A scheduled local notification
  // rings through the OS even with the screen off; the in-app alarm fires
  // normally when the user opens the screen again.
  const timerNotificationIdRef = useRef<string | null>(null);

  const cancelTimerNotification = useCallback(() => {
    if (timerNotificationIdRef.current && Platform.OS !== "web") {
      Notifications.cancelScheduledNotificationAsync(timerNotificationIdRef.current).catch(() => {});
      timerNotificationIdRef.current = null;
    }
  }, []);

  const scheduleTimerNotification = useCallback(
    (seconds: number, body: string) => {
      if (Platform.OS === "web" || seconds <= 0) return;
      if (timerNotificationIdRef.current) {
        Notifications.cancelScheduledNotificationAsync(timerNotificationIdRef.current).catch(() => {});
        timerNotificationIdRef.current = null;
      }
      // Use a "timer-" prefixed identifier so the foreground notification handler
      // in _layout.tsx can suppress it (the in-app alarm already handles the alert
      // when the app is open; the OS notification is only needed for screen-off).
      const identifier = `${TIMER_NOTIF_PREFIX}${Date.now()}`;
      // Compute the exact wall-clock time when the timer expires.
      // On Android this maps to AlarmManager.setExactAndAllowWhileIdle
      // which bypasses Doze mode — critical for screen-off delivery.
      const fireDate = new Date(Date.now() + Math.max(1, Math.ceil(seconds)) * 1000);
      Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: "⏰ Topter",
          body,
          // "default" (string) triggers system sound; required for Android channels.
          sound: "default",
          // MAX priority ensures the OS wakes the screen and plays sound/vibration
          // even when the phone is locked — critical for the screen-off alarm.
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
          channelId: "timer",
        },
      })
        .then((id) => { timerNotificationIdRef.current = id; })
        .catch(() => {});
    },
    [],
  );

  // ── Core start functions ───────────────────────────────────────────────────
  const startFocus = useCallback(() => {
    const goal = focusMinutes * 60;
    setPhase("focus");
    setFocusElapsed(0);
    setFocusGoalElapsed(goal);
    setPaused(false);
    setPauseCount(0);
    lastTickRef.current = null;
    scheduleTimerNotification(goal, "Focus session complete! Time to take a short break.");
    if (hapticsOn && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
  }, [hapticsOn, focusMinutes, scheduleTimerNotification]);

  const startBreak = useCallback(() => {
    const secs = breakMinutes * 60;
    setPhase("break");
    setRemaining(secs);
    setPaused(false);
    setShowBreakPopup(false);
    lastTickRef.current = null;
    setTipIndex(Math.floor(Math.random() * ALL_BREAK_TIPS.length));
    scheduleTimerNotification(secs, "Break is over! Time to get back to studying.");
  }, [breakMinutes, scheduleTimerNotification]);

  // ── Auto-start (waits for restore check) ──────────────────────────────────
  useEffect(() => {
    if (!settingsLoading && topic && restoreChecked && !autoStartedRef.current) {
      autoStartedRef.current = true;
      if (!wasRestored) {
        startFocus();
        hasDndReminderBeenSeen().then((seen) => {
          if (!seen) setShowDndReminder(true);
        });
      } else {
        hasDndReminderBeenSeen().then((seen) => {
          if (!seen) setShowDndReminder(true);
        });
      }
    }
  }, [settingsLoading, topic, restoreChecked, wasRestored, startFocus]);

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (paused) {
      lastTickRef.current = null;
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const last = lastTickRef.current ?? now;
      const deltaSec = Math.max(0, (now - last) / 1000);
      lastTickRef.current = now;
      if (phase === "focus") {
        setFocusElapsed((prev) => prev + deltaSec);
      } else if (phase === "break") {
        setRemaining((prev) => Math.max(0, prev - deltaSec));
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, paused]);

  // ── Notification cancel on pause ──────────────────────────────────────────
  // Cancel the OS-scheduled notification when paused so it doesn't fire at the
  // wrong wall-clock time. Rescheduling on resume is handled by handleTogglePause
  // and each explicit start/action function (startFocus, startBreak, etc.) to
  // avoid double-scheduling two notifications for the same event.
  useEffect(() => {
    if (paused) {
      cancelTimerNotification();
    }
  }, [paused, cancelTimerNotification]);

  // ── Focus goal reached → break popup ──────────────────────────────────────
  useEffect(() => {
    if (phase !== "focus") return;
    if (focusGoalElapsed > 0 && focusElapsed >= focusGoalElapsed) {
      cancelTimerNotification();
      if (settings.autoStartBreak) {
        // Clear the flag even in the auto-start path so a subsequent break goal
        // detection in the foreground fires the in-app alarm normally.
        goalPassedWhileBackgroundedRef.current = false;
        startBreak();
      } else {
        // Guard: only start the alarm once — if popup is already showing, the
        // alarm is already running; don't start (and orphan) a second one.
        if (showBreakPopup) return;
        // If the OS lock-screen notification already alerted the user while the
        // screen was off, skip the duplicate in-app alarm.
        if (!goalPassedWhileBackgroundedRef.current) {
          // Stop any lingering alarm before starting a fresh one.
          if (alarmStopRef.current) {
            alarmStopRef.current();
            alarmStopRef.current = null;
          }
          alarmStopRef.current = startAlarm();
        }
        goalPassedWhileBackgroundedRef.current = false;
        setPaused(true);
        setShowBreakPopup(true);
      }
    }
  }, [phase, focusElapsed, focusGoalElapsed, settings.autoStartBreak, startBreak, showBreakPopup, cancelTimerNotification]);

  // ── Break timer ends → after-break modal ──────────────────────────────────
  useEffect(() => {
    if (phase !== "break") return;
    if (remaining <= 0) {
      // Guard: only start the alarm once — if modal is already showing the
      // alarm is already running.
      if (showAfterBreakModal) return;
      cancelTimerNotification();
      // If the OS lock-screen notification already alerted the user while the
      // screen was off, skip the duplicate in-app alarm.
      if (!goalPassedWhileBackgroundedRef.current) {
        // Stop any lingering alarm before starting a fresh one.
        if (alarmStopRef.current) {
          alarmStopRef.current();
          alarmStopRef.current = null;
        }
        alarmStopRef.current = startAlarm();
      }
      goalPassedWhileBackgroundedRef.current = false;
      setPaused(true);
      setShowAfterBreakModal(true);
    }
  }, [phase, remaining, showAfterBreakModal, cancelTimerNotification]);

  // ── Rotate tips during break ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "break") return;
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % ALL_BREAK_TIPS.length);
    }, BREAK_TIP_DURATION_MS);
    return () => clearInterval(id);
  }, [phase]);

  // ── Break pulse animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "break") return;
    const loop = setInterval(() => {
      pulse.setValue(1);
      const Animated = require("react-native").Animated;
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 380, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]).start();
    }, 900);
    return () => clearInterval(loop);
  }, [phase, pulse]);

  // ── Alarm helpers ──────────────────────────────────────────────────────────
  const stopAlarm = useCallback(() => {
    if (alarmStopRef.current) {
      alarmStopRef.current();
      alarmStopRef.current = null;
    }
  }, []);

  // Stop alarm when the component unmounts (e.g. user navigates away)
  useEffect(() => stopAlarm, [stopAlarm]);

  // Cancel notifications on unmount
  useEffect(() => cancelTimerNotification, [cancelTimerNotification]);

  // ── Request notification permissions + ensure timer channel ───────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      Notifications.requestPermissionsAsync().catch(() => {});
      ensureTimerChannel().catch(() => {});
      // On Android 12+, SCHEDULE_EXACT_ALARM is a separate runtime permission
      // the user must grant in system settings — it's not a standard prompt.
      // If it's missing, the OS notification may arrive late or not at all when
      // the screen is off. Show a one-time modal with a direct link to settings.
      canScheduleExactAlarmsAsync().then((can) => {
        if (!can) setShowExactAlarmModal(true);
      }).catch(() => {});
    }
  }, []);

  // ── BackHandler: intercept Android back button ─────────────────────────────
  // Default back navigation unmounts the screen and resets the timer to zero.
  // Instead, treat it exactly like the X button (pause + save progress).
  const handleExitRef = useRef<() => void>(() => {});
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleExitRef.current();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const clearPersistedState = () => {
    AsyncStorage.removeItem(FOCUS_STATE_KEY).catch(() => {});
  };

  const handleFinishSession = () => {
    if (!topic) return;
    setSessionMinutesSnap(Math.max(0, Math.round(focusElapsed / 60)));
    setPausedBeforeRating(paused);
    setPaused(true);
    stopAlarm();
    cancelTimerNotification();
    setShowRatingSheet(true);
  };

  const handleRatingSheetDismiss = () => {
    if (ratingSaving) return;
    setShowRatingSheet(false);
    setRatingSelected(null);
    if (!pausedBeforeRating) {
      setPaused(false);
    }
  };

  const handleRateTap = async (d: Difficulty) => {
    if (ratingSaving || ratingSelected !== null || !topic) return;
    setRatingSelected(d);
    setRatingSaving(true);
    if (hapticsOn && Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    await new Promise<void>((r) => setTimeout(r, 350));
    await recordSession({
      topicId: topic.id,
      minutes: sessionMinutesSnap,
      difficulty: d,
      pauseCount,
      examContext: { active: examModeActive, subjects: examSubjects, date: examDate },
    });
    if (Platform.OS !== "web") {
      const preview = srPreviews[d];
      const daysUntilReview = examCapActive
        ? Math.min(preview.effectiveDays, 1)
        : preview.effectiveDays;
      const nextReviewAt = Date.now() + daysUntilReview * DAY_MS;
      void scheduleTopicRevisionNotification(topic.id, topic.topicName, topic.subject, nextReviewAt);
      void cancelTodayStreakAlert();
      const totalSessions = topics.reduce((sum, t) => sum + (t.sessions?.length ?? 0), 0) + 1;
      void checkAndScheduleMilestoneNotification(totalSessions);
    }
    await showInterstitialIfDue();
    AsyncStorage.removeItem(FOCUS_STATE_KEY).catch(() => {});
    stopAlarm();
    router.replace("/home");
  };

  const handleExit = () => {
    stopAlarm();
    cancelTimerNotification();
    // Save progress so re-entering this topic resumes from where the user left off.
    // savedAt: null → don't add wall-clock time on restore (user deliberately exited).
    if (topic) {
      AsyncStorage.setItem(
        FOCUS_STATE_KEY,
        JSON.stringify({
          topicId,
          phase: phaseRef.current,
          focusElapsed: focusElapsedRef.current,
          focusGoalElapsed: focusGoalElapsedRef.current,
          remaining: remainingRef.current,
          pauseCount: pauseCountRef.current,
          savedAt: null,
          pausedByCall: false,
        }),
      ).catch(() => {});
    }
    router.replace("/home");
  };

  // Keep ref current so the BackHandler closure always calls latest handleExit
  useEffect(() => { handleExitRef.current = handleExit; });

  // Pause/resume toggle with correct notification lifecycle:
  //   pause  → cancel OS notification (lifecycle effect handles this)
  //   resume → reschedule notification for the remaining time
  // Keeping this explicit avoids double-scheduling that occurred when both
  // the start functions AND the old paused-watcher effect each called
  // scheduleTimerNotification in the same React commit.
  const handleTogglePause = useCallback(() => {
    tap();
    if (!pausedRef.current) {
      // Currently running → pause
      if (phaseRef.current === "focus") setPauseCount((c) => c + 1);
      setPaused(true);
    } else {
      // Currently paused → resume, reschedule notification for remaining time
      setPaused(false);
      if (phaseRef.current === "focus" && focusGoalElapsedRef.current > 0) {
        const rem = Math.max(0, focusGoalElapsedRef.current - focusElapsedRef.current);
        if (rem > 0) scheduleTimerNotification(rem, "Focus session complete! Time to take a short break.");
      } else if (phaseRef.current === "break" && remainingRef.current > 0) {
        scheduleTimerNotification(remainingRef.current, "Break is over! Time to get back to studying.");
      }
    }
  }, [tap, scheduleTimerNotification]);

  // Break popup: Continue Study (no break taken — push goal forward)
  const handleContinueStudy = () => {
    stopAlarm();
    setShowBreakPopup(false);
    setFocusGoalElapsed(focusElapsedRef.current + focusMinutes * 60);
    setPaused(false);
    lastTickRef.current = null;
    scheduleTimerNotification(focusMinutes * 60, "Focus session complete! Time to take a short break.");
  };

  // Break popup: Take Break
  const handleTakeBreak = () => {
    stopAlarm();
    startBreak();
  };

  // "Take Break" button: pause → try rewarded ad → start break regardless
  // The break is a core feature; if the ad fails (no real IDs configured,
  // production build, network issue, or user dismissed it) we still start
  // the break so the user never gets stuck in a broken state.
  const handleManualBreak = useCallback(async () => {
    tap();
    // On web/Expo preview there is no ad SDK — start break immediately
    if (Platform.OS === "web") {
      startBreak();
      return;
    }
    setPaused(true);
    setTakingBreak(true);
    try {
      await showRewardedAd();
    } catch {
      // ignore ad errors
    } finally {
      setTakingBreak(false);
      startBreak();
    }
  }, [tap, showRewardedAd, startBreak]);

  // During break: Skip (return to focus immediately)
  const handleSkipBreak = () => {
    setShowBreakPopup(false);
    setFocusGoalElapsed(focusElapsedRef.current + focusMinutes * 60);
    setPhase("focus");
    setPaused(false);
    lastTickRef.current = null;
    scheduleTimerNotification(focusMinutes * 60, "Focus session complete! Time to take a short break.");
  };

  // During break: Extend (add another break block)
  const handleExtendCurrentBreak = () => {
    const extra = breakMinutes * 60;
    const newRemaining = remainingRef.current + extra;
    setRemaining(newRemaining);
    scheduleTimerNotification(newRemaining, "Break is over! Time to get back to studying.");
  };

  // After-break modal: Continue Study
  const handleContinueStudyAfterBreak = () => {
    stopAlarm();
    setShowAfterBreakModal(false);
    setFocusGoalElapsed(focusElapsedRef.current + focusMinutes * 60);
    setPhase("focus");
    setPaused(false);
    lastTickRef.current = null;
    scheduleTimerNotification(focusMinutes * 60, "Focus session complete! Time to take a short break.");
  };

  // After-break modal: Extend Break
  const handleExtendBreak = () => {
    stopAlarm();
    setShowAfterBreakModal(false);
    const secs = breakMinutes * 60;
    setRemaining(secs);
    setPhase("break");
    setPaused(false);
    lastTickRef.current = null;
    scheduleTimerNotification(secs, "Break is over! Time to get back to studying.");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!topic) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
          Topic not found.
        </Text>
        <Pressable
          onPress={handleExit}
          style={({ pressed }) => [
            {
              marginTop: 20,
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 12,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 14 }}>
            Back to Home
          </Text>
        </Pressable>
      </View>
    );
  }

  const goalProgress =
    phase === "focus"
      ? focusGoalElapsed > 0
        ? Math.min(1, Math.max(0,
            (focusElapsed - (focusGoalElapsed - focusMinutes * 60)) / (focusMinutes * 60)
          ))
        : 0
      : Math.min(1, Math.max(0, remaining / (breakMinutes * 60)));

  const isOvertime =
    phase === "focus" &&
    focusGoalElapsed > 0 &&
    focusElapsed > focusGoalElapsed;

  const overtimeElapsed = isOvertime
    ? focusElapsed - focusGoalElapsed
    : 0;

  return (
    <LinearGradient
      colors={
        phase === "break"
          ? ["#0d1117", "#0d1117", "#0d1117"]
          : ["#0b1020", "#1e1b4b", "#0b1020"]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 16, paddingBottom: bottomInset + 24 },
        ]}
      >
        {phase !== "break" && (
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTopRow}>
              <View style={[styles.modeBadge, phase === "break" && styles.modeBadgeBreak]}>
                <Feather
                  name={phase === "focus" ? "zap" : "coffee"}
                  size={11}
                  color={phase === "focus" ? "#a5b4fc" : "#22d3ee"}
                />
                <Text style={[styles.modeBadgeText, phase === "break" && styles.modeBadgeTextBreak]}>
                  {phase === "focus" ? "Deep Focus" : "Healthy Break"}
                </Text>
              </View>
              {/* ── Pomodoro session dot indicator ──────────────────────────────────────────────── */}
              {(() => {
                const sessionNum =
                  focusGoalElapsed > 0
                    ? Math.ceil(focusGoalElapsed / (focusMinutes * 60))
                    : 1;
                const dots = Math.min(sessionNum, 4);
                return (
                  <View style={styles.dotRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.pomoDot,
                          i < dots
                            ? styles.pomoDotFilled
                            : styles.pomoDotEmpty,
                        ]}
                      />
                    ))}
                  </View>
                );
              })()}
            </View>
            <View style={styles.subjectChip}>
              <Text style={styles.subjectChipText} numberOfLines={1}>
                {topic.subject}
              </Text>
            </View>
            <Text style={[styles.topicLine, { textAlign: "center" }]} numberOfLines={2}>
              {topic.topicName}
            </Text>
          </View>
        </View>
        )}

        <TimerBody
          elapsed={focusElapsed}
          remaining={remaining}
          goalProgress={goalProgress}
          isOvertime={isOvertime}
          overtimeElapsed={overtimeElapsed}
          phase={phase}
          paused={paused}
          focusMinutes={focusMinutes}
          breakMinutes={breakMinutes}
          onTogglePause={handleTogglePause}
          onFinish={handleFinishSession}
          onSkipBreak={handleSkipBreak}
          onExtendBreak={handleExtendCurrentBreak}
          onTakeBreak={handleManualBreak}
          takingBreak={takingBreak}
          tip={ALL_BREAK_TIPS[tipIndex % ALL_BREAK_TIPS.length]!}
          pulse={pulse}
          elapsedFocusMin={Math.floor(focusElapsed / 60)}
          quote={quote}
          tipIndex={tipIndex}
          totalTips={ALL_BREAK_TIPS.length}
        />
      </ScrollView>

      <BreakPopup
        visible={showBreakPopup}
        onContinue={handleContinueStudy}
        onBreak={handleTakeBreak}
      />

      {/* After-break modal */}
      <Modal
        visible={showAfterBreakModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Feather name="sun" size={28} color="#22d3ee" />
            </View>
            <Text style={styles.modalTitle}>Break's over!</Text>
            <Text style={styles.modalSub}>Ready to get back to it?</Text>
            <View style={styles.modalRow}>
              <Pressable
                onPress={handleExtendBreak}
                style={({ pressed }) => [
                  styles.modalSecondary,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.modalSecondaryText}>Extend Break</Text>
              </Pressable>
              <Pressable
                onPress={handleContinueStudyAfterBreak}
                style={({ pressed }) => [
                  styles.modalPrimary,
                  { opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={styles.modalPrimaryText}>Continue Study</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Rating bottom sheet ── */}
      <Modal
        visible={showRatingSheet}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleRatingSheetDismiss}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleRatingSheetDismiss} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetMetaRow}>
              <View style={styles.sheetTopicChip}>
                <Text style={styles.sheetTopicChipText} numberOfLines={1}>
                  {topic?.topicName}
                </Text>
              </View>
              <View style={styles.sheetDurationChip}>
                <Feather name="clock" size={12} color="rgba(255,255,255,0.55)" />
                <Text style={styles.sheetDurationText}>
                  {sessionMinutesSnap < 1 ? "< 1 min" : `${sessionMinutesSnap} min`}
                </Text>
              </View>
            </View>
            <Text style={styles.sheetTitle}>How did it feel?</Text>
            <Text style={styles.sheetSubtitle}>Your answer sets the next revision date</Text>
            <View style={styles.sheetCardsStack}>
              {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
                const tint = DIFF_TINT[d];
                const preview = srPreviews[d];
                const isActive = ratingSelected === d;
                const intervalLabel = examCapActive
                  ? "Revise tomorrow"
                  : `Revise in ${preview.newInterval} ${preview.newInterval === 1 ? "day" : "days"}`;
                return (
                  <Pressable
                    key={d}
                    onPress={() => { void handleRateTap(d); }}
                    disabled={ratingSaving || examCapActive}
                    style={({ pressed }) => [
                      styles.sheetRatingBtn,
                      {
                        backgroundColor: isActive ? tint : `${tint}18`,
                        borderColor: isActive ? tint : `${tint}40`,
                        opacity: examCapActive ? 0.45 : pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <View style={styles.sheetRatingBtnLeft}>
                      <Text style={styles.sheetRatingLabel}>{DIFF_LABEL[d]}</Text>
                      <Text style={[styles.sheetRatingGuide, { color: isActive ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.55)" }]}>
                        {DIFF_GUIDE[d]}
                      </Text>
                    </View>
                    <Text style={[styles.sheetRatingDays, { color: isActive ? "#fff" : tint }]} numberOfLines={1}>
                      {intervalLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {examCapActive ? (
              <View style={styles.sheetLockedBox}>
                <Feather name="zap" size={14} color="#f97316" />
                <Text style={styles.sheetLockedHint}>
                  Priority topic in Exam Mode — review auto-scheduled for tomorrow.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <DndReminderModal
        visible={showDndReminder}
        onDismiss={() => setShowDndReminder(false)}
      />

      {/* Exact alarm permission — Android 12+. Without this the OS timer
          notification may arrive late when the screen is locked. */}
      {showExactAlarmModal && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setShowExactAlarmModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconWrap}>
                <Feather name="bell" size={28} color="#a5b4fc" />
              </View>
              <Text style={styles.modalTitle}>Allow exact alarms</Text>
              <Text style={styles.modalSub}>
                To ring at the exact moment your timer ends — even with the screen off — this app needs permission to schedule exact alarms. Without it, the alarm may arrive late.
              </Text>
              <View style={styles.modalRow}>
                <Pressable
                  onPress={() => setShowExactAlarmModal(false)}
                  style={({ pressed }) => [styles.modalSecondary, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={styles.modalSecondaryText}>Skip</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setShowExactAlarmModal(false); openExactAlarmSettings(); }}
                  style={({ pressed }) => [styles.modalPrimary, { opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={styles.modalPrimaryText}>Open Settings</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </LinearGradient>
  );
}

const RING_SIZE = 232;
const RING_RADIUS = 96;
const RING_STROKE = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function TimerBody({
  elapsed,
  remaining,
  goalProgress,
  isOvertime,
  overtimeElapsed,
  phase,
  paused,
  focusMinutes,
  breakMinutes,
  onTogglePause,
  onFinish,
  onSkipBreak,
  onExtendBreak,
  onTakeBreak,
  takingBreak,
  tip,
  pulse,
  elapsedFocusMin,
  quote,
  tipIndex,
  totalTips,
}: {
  elapsed: number;
  remaining: number;
  goalProgress: number;
  isOvertime: boolean;
  overtimeElapsed: number;
  phase: Phase;
  paused: boolean;
  focusMinutes: number;
  breakMinutes: number;
  onTogglePause: () => void;
  onFinish: () => void;
  onSkipBreak: () => void;
  onExtendBreak: () => void;
  onTakeBreak: () => void;
  takingBreak: boolean;
  tip: string;
  pulse: any;
  elapsedFocusMin: number;
  quote: string;
  tipIndex: number;
  totalTips: number;
}) {
  if (phase === "break") {
    return (
      <BreakBody
        remaining={remaining}
        tip={tip}
        tipIndex={tipIndex}
        totalTips={totalTips}
        onSkipBreak={onSkipBreak}
        onExtendBreak={onExtendBreak}
        onFinish={onFinish}
      />
    );
  }

  const focusAccent = isOvertime ? "#f59e0b" : "#a5b4fc";
  const accent = phase === "break" ? "#22d3ee" : focusAccent;
  const displayTime = phase === "focus" ? elapsed : remaining;

  const statusLabel =
    phase === "break"
      ? "Break"
      : paused
        ? "Paused"
        : isOvertime
          ? "Overtime"
          : "Focusing";

  const dashOffset = RING_CIRCUMFERENCE * (1 - goalProgress);
  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;

  const gradId = phase === "break" ? "breakGrad" : isOvertime ? "overtimeGrad" : "focusGrad";

  return (
    <View style={styles.timerWrap}>
      {/* Arc ring */}
      <View
        style={[
          styles.ringContainer,
          isOvertime && styles.ringContainerOvertime,
        ]}
      >
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
          <Defs>
            <SvgGradient id="focusGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#818cf8" />
              <Stop offset="100%" stopColor="#a5b4fc" />
            </SvgGradient>
            <SvgGradient id="overtimeGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#f59e0b" />
              <Stop offset="100%" stopColor="#fbbf24" />
            </SvgGradient>
            <SvgGradient id="breakGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#06b6d4" />
              <Stop offset="100%" stopColor="#22d3ee" />
            </SvgGradient>
          </Defs>
          {/* Track */}
          <Circle
            cx={cx}
            cy={cy}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={RING_STROKE}
          />
          {/* Progress arc */}
          <Circle
            cx={cx}
            cy={cy}
            r={RING_RADIUS}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={RING_STROKE}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${cx}, ${cy}`}
          />
        </Svg>

        {/* Content inside ring */}
        <View style={styles.ringInner} pointerEvents="none">
          <Text style={styles.timerValue}>{fmt(displayTime)}</Text>
          <Text style={[styles.timerStatusLabel, { color: accent }]}>
            {statusLabel}
          </Text>
          {phase === "focus" && !isOvertime ? (
            <Text style={styles.goalLabel}>
              Goal {String(Math.floor(focusMinutes)).padStart(2, "0")}:00
            </Text>
          ) : phase === "focus" && isOvertime ? (
            <Text style={[styles.overtimeLabel]}>
              +{fmt(overtimeElapsed)} extra
            </Text>
          ) : (
            <Text style={styles.goalLabel}>
              {String(Math.floor(breakMinutes)).padStart(2, "0")}:00 break
            </Text>
          )}
        </View>
      </View>

      {/* Stat / break tip */}
      {phase === "break" ? (
        <BreakTipCarousel tip={tip} pulse={pulse} />
      ) : (
        <View style={styles.statRow}>
          <Feather name="book-open" size={13} color="rgba(255,255,255,0.45)" />
          <Text style={styles.statText}>
            {elapsedFocusMin === 0
              ? "Session just started"
              : `${elapsedFocusMin} min studied so far`}
          </Text>
        </View>
      )}

      {/* Controls */}
      {phase === "focus" ? (
        <>
          <View style={styles.controlsRow}>
            <Pressable
              onPress={onTogglePause}
              style={({ pressed }) => [
                styles.pauseBtn,
                paused && styles.pauseBtnActive,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Feather name={paused ? "play" : "pause"} size={20} color={paused ? "#0b1020" : "#fff"} />
              <Text style={[styles.pauseBtnText, paused && styles.pauseBtnTextActive]}>
                {paused ? "Resume" : "Pause"}
              </Text>
            </Pressable>

            <Pressable
              onPress={onTakeBreak}
              disabled={takingBreak}
              style={({ pressed }) => [
                styles.breakBtn,
                { opacity: takingBreak || pressed ? 0.65 : 1 },
              ]}
            >
              {takingBreak ? (
                <ActivityIndicator size="small" color="#f59e0b" />
              ) : (
                <Feather name="coffee" size={18} color="#f59e0b" />
              )}
              <Text style={styles.breakBtnText}>
                {takingBreak ? "Loading…" : "Take Break"}
              </Text>
            </Pressable>
          </View>
          {!takingBreak ? (
            <Text style={styles.takeBreakHint}>
              {Platform.OS === "web"
                ? "Start your break whenever you need one"
                : "Watch a short ad to start your break early"}
            </Text>
          ) : null}
        </>
      ) : (
        <View style={styles.controlsRow}>
          <ControlButton icon="skip-forward" label="Skip Break" onPress={onSkipBreak} />
          <ControlButton icon="plus" label="Extend Break" onPress={onExtendBreak} />
        </View>
      )}

      <Text style={styles.quoteText}>{quote}</Text>
      <PrimaryButton title="Complete Topic" onPress={onFinish} />
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlBtn,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Feather name={icon} size={18} color="#fff" />
      <Text style={styles.controlBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, gap: 26 },

  // ── Header ─────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: { flex: 1, gap: 6 },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(165,180,252,0.12)",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.25)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeBreak: {
    backgroundColor: "rgba(34,211,238,0.10)",
    borderColor: "rgba(34,211,238,0.25)",
  },
  modeBadgeText: {
    color: "#a5b4fc",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  modeBadgeTextBreak: { color: "#22d3ee" },
  subjectChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(34,211,238,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  subjectChipText: {
    color: "#22d3ee",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  topicLine: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pomoDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pomoDotFilled: {
    backgroundColor: "#ffffff",
  },
  pomoDotEmpty: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  // ── Ring ───────────────────────────────────────────────────────────────────
  timerWrap: { gap: 22, alignItems: "center" },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringContainerOvertime: {
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  ringSvg: { position: "absolute" },
  ringInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  timerValue: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 58,
    letterSpacing: -2,
    lineHeight: 64,
  },
  timerStatusLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  goalLabel: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  overtimeLabel: {
    color: "#f59e0b",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.6,
    marginTop: 2,
  },

  // ── Stat row ───────────────────────────────────────────────────────────────
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statText: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },

  // ── Controls ───────────────────────────────────────────────────────────────
  controlsRow: { flexDirection: "row", gap: 10, width: "100%" },
  pauseBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  pauseBtnActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  pauseBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  pauseBtnTextActive: { color: "#0b1020" },
  breakBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.28)",
  },
  breakBtnText: {
    color: "#f59e0b",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  controlBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  controlBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  takeBreakHint: {
    color: "rgba(255,255,255,0.28)",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  quoteText: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    letterSpacing: 0.1,
    paddingHorizontal: 16,
  },

  // ── After-break modal ──────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 22,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 14,
  },
  modalIconWrap: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(34,211,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  modalTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  modalSub: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
  },
  modalRow: { flexDirection: "row", gap: 12 },
  modalSecondary: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  modalSecondaryText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  modalPrimary: {
    flex: 1,
    backgroundColor: "#22d3ee",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  modalPrimaryText: {
    color: "#0b1020",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },

  // ── Rating bottom sheet ────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(3,7,18,0.75)",
  },
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  sheetTopicChip: {
    backgroundColor: "rgba(34,211,238,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.22)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 1,
  },
  sheetTopicChipText: {
    color: "#22d3ee",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  sheetDurationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sheetDurationText: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  sheetTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginTop: -6,
  },
  sheetCardsStack: {
    gap: 8,
  },
  sheetRatingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 2,
    gap: 14,
  },
  sheetRatingBtnLeft: {
    flex: 1,
    gap: 3,
  },
  sheetRatingLabel: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  sheetRatingGuide: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  sheetRatingDays: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 0.2,
    flexShrink: 1,
    textAlign: "right",
  },
  sheetLockedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(249,115,22,0.08)",
    borderColor: "rgba(249,115,22,0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  sheetLockedHint: {
    color: "#f97316",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Break screen — animation components
// ─────────────────────────────────────────────────────────────────────────────

function BreatheAnim() {
  const s1 = useRef(new Animated.Value(1)).current;
  const s2 = useRef(new Animated.Value(1)).current;
  const s3 = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(s1, { toValue: 1.25, duration: 2200, useNativeDriver: true }),
          Animated.timing(s2, { toValue: 1.18, duration: 2700, useNativeDriver: true }),
          Animated.timing(s3, { toValue: 1.1, duration: 3200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(s1, { toValue: 1, duration: 2200, useNativeDriver: true }),
          Animated.timing(s2, { toValue: 1, duration: 2700, useNativeDriver: true }),
          Animated.timing(s3, { toValue: 1, duration: 3200, useNativeDriver: true }),
        ]),
      ])
    );
    a.start();
    return () => a.stop();
  }, [s1, s2, s3]);
  return (
    <View style={animSt.container}>
      <Animated.View style={[animSt.breatheRing3, { transform: [{ scale: s3 }] }]} />
      <Animated.View style={[animSt.breatheRing2, { transform: [{ scale: s2 }] }]} />
      <Animated.View style={[animSt.breatheRing1, { transform: [{ scale: s1 }] }]} />
    </View>
  );
}

function WaterAnim() {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(fill, { toValue: 1, duration: 2800, useNativeDriver: false }),
        Animated.delay(700),
        Animated.timing(fill, { toValue: 0, duration: 400, useNativeDriver: false }),
        Animated.delay(400),
      ])
    );
    a.start();
    return () => a.stop();
  }, [fill]);
  return (
    <View style={animSt.container}>
      <View style={animSt.glass}>
        <Animated.View style={[animSt.water, {
          height: fill.interpolate({ inputRange: [0, 1], outputRange: [0, 88] }),
        }]} />
      </View>
      <Text style={animSt.emoji}>💧</Text>
    </View>
  );
}

function EyeRestAnim() {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(blink, { toValue: 0.08, duration: 180, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(blink, { toValue: 0.08, duration: 180, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 180, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [blink]);
  return (
    <View style={animSt.container}>
      <View style={{ flexDirection: "row", gap: 18, marginBottom: 14 }}>
        {[0, 1].map((i) => (
          <View key={i} style={animSt.eyeOuter}>
            <Animated.View style={[animSt.eyePupil, { transform: [{ scaleY: blink }] }]} />
          </View>
        ))}
      </View>
      <Text style={animSt.emoji}>🙌</Text>
    </View>
  );
}

function StretchAnim() {
  const armsY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(armsY, { toValue: -28, duration: 1600, useNativeDriver: true }),
        Animated.delay(700),
        Animated.timing(armsY, { toValue: 0, duration: 1600, useNativeDriver: true }),
        Animated.delay(700),
      ])
    );
    a.start();
    return () => a.stop();
  }, [armsY]);
  return (
    <View style={animSt.container}>
      <View style={{ alignItems: "center" }}>
        <View style={animSt.figHead} />
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: -2 }}>
          <Animated.View style={[animSt.armH, { transform: [{ translateY: armsY }, { rotate: "-30deg" }] }]} />
          <View style={animSt.figBody} />
          <Animated.View style={[animSt.armH, { transform: [{ translateY: armsY }, { rotate: "30deg" }] }]} />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
          <View style={[animSt.leg, { transform: [{ rotate: "10deg" }] }]} />
          <View style={[animSt.leg, { transform: [{ rotate: "-10deg" }] }]} />
        </View>
      </View>
    </View>
  );
}

function WalkAnim() {
  const swing = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(swing, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(swing, { toValue: 0, duration: 480, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [swing]);
  const legL = swing.interpolate({ inputRange: [0, 1], outputRange: ["28deg", "-28deg"] });
  const legR = swing.interpolate({ inputRange: [0, 1], outputRange: ["-28deg", "28deg"] });
  const armL = swing.interpolate({ inputRange: [0, 1], outputRange: ["-18deg", "18deg"] });
  const armR = swing.interpolate({ inputRange: [0, 1], outputRange: ["18deg", "-18deg"] });
  return (
    <View style={animSt.container}>
      <View style={{ alignItems: "center" }}>
        <View style={animSt.figHead} />
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: -2 }}>
          <Animated.View style={[animSt.armH, { transform: [{ rotate: armL }] }]} />
          <View style={animSt.figBody} />
          <Animated.View style={[animSt.armH, { transform: [{ rotate: armR }] }]} />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
          <Animated.View style={[animSt.leg, { transform: [{ rotate: legL }] }]} />
          <Animated.View style={[animSt.leg, { transform: [{ rotate: legR }] }]} />
        </View>
      </View>
    </View>
  );
}

function MindfulAnim() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.1, duration: 2000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.88, duration: 2000, useNativeDriver: true }),
        ]),
      ])
    );
    a.start();
    return () => a.stop();
  }, [opacity, scale]);
  return (
    <View style={animSt.container}>
      <Animated.View style={[animSt.mindfulOuter, { opacity, transform: [{ scale }] }]} />
      <Animated.View style={[animSt.mindfulInner, { opacity }]} />
      <Text style={[animSt.emoji, { marginTop: 8 }]}>✨</Text>
    </View>
  );
}

function getAnimationForTip(tip: string): "breathe" | "water" | "eye" | "stretch" | "walk" | "mindful" {
  const t = tip.toLowerCase();
  if (/breath|inhale|exhale|relax|deep/.test(t)) return "breathe";
  if (/water|drink|hydrate|fluid|sip/.test(t)) return "water";
  if (/eye|eyes|blink|screen|vision|palm/.test(t)) return "eye";
  if (/walk|stand|move|step|stroll/.test(t)) return "walk";
  if (/stretch|neck|shoulder|back|spine|posture|wrist/.test(t)) return "stretch";
  if (/smile|mind|mental|stress|grateful|positive/.test(t)) return "mindful";
  return "breathe";
}

function BreakTipProgress({ tipIndex, totalTips }: { tipIndex: number; totalTips: number }) {
  const [elapsed, setElapsed] = useState(0);
  const SECS = BREAK_TIP_DURATION_MS / 1000;

  useEffect(() => { setElapsed(0); }, [tipIndex]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => Math.min(e + 0.25, SECS)), 250);
    return () => clearInterval(id);
  }, [SECS]);

  const pct = Math.min((elapsed / SECS) * 100, 100);
  const remaining = Math.max(0, Math.round(SECS - elapsed));

  return (
    <View style={bkSt.progressWrap}>
      <View style={bkSt.progressTrack}>
        <View style={[bkSt.progressBar, { width: `${pct}%` as any }]} />
      </View>
      <View style={bkSt.progressRow}>
        <Text style={bkSt.progressText}>Tip {tipIndex + 1} of {totalTips}</Text>
        <Text style={bkSt.progressText}>{remaining}s remaining</Text>
      </View>
    </View>
  );
}

function BreakBody({
  remaining,
  tip,
  tipIndex,
  totalTips,
  onSkipBreak,
  onExtendBreak,
  onFinish,
}: {
  remaining: number;
  tip: string;
  tipIndex: number;
  totalTips: number;
  onSkipBreak: () => void;
  onExtendBreak: () => void;
  onFinish: () => void;
}) {
  const animType = getAnimationForTip(tip);
  const AnimComp =
    animType === "water"   ? WaterAnim   :
    animType === "eye"     ? EyeRestAnim :
    animType === "stretch" ? StretchAnim :
    animType === "walk"    ? WalkAnim    :
    animType === "mindful" ? MindfulAnim :
    BreatheAnim;

  return (
    <View style={bkSt.root}>
      {/* Header */}
      <View style={bkSt.header}>
        <View style={bkSt.badge}>
          <Feather name="coffee" size={11} color="#EF9F27" />
          <Text style={bkSt.badgeText}>HEALTHY BREAK</Text>
        </View>
        <View style={bkSt.timePill}>
          <Text style={bkSt.timePillText}>{fmt(remaining)} left</Text>
        </View>
      </View>

      {/* Animation */}
      <View style={bkSt.animArea}>
        <AnimComp />
      </View>

      {/* Dot indicators */}
      <View style={bkSt.dots}>
        {Array.from({ length: totalTips }).map((_, i) => (
          <View key={i} style={[bkSt.dot, i === tipIndex && bkSt.dotActive]} />
        ))}
      </View>

      {/* Tip card */}
      <View style={bkSt.tipCard}>
        <Text style={bkSt.tipLabel}>TIP</Text>
        <Text style={bkSt.tipText}>{tip}</Text>
      </View>

      {/* Progress bar + counter */}
      <BreakTipProgress tipIndex={tipIndex} totalTips={totalTips} />

      {/* Buttons */}
      <View style={bkSt.btnRow}>
        <Pressable
          onPress={onSkipBreak}
          style={({ pressed }) => [bkSt.skipBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="skip-forward" size={16} color="rgba(255,255,255,0.65)" />
          <Text style={bkSt.skipBtnText}>Skip Break</Text>
        </Pressable>
        <Pressable
          onPress={onExtendBreak}
          style={({ pressed }) => [bkSt.extendBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="plus" size={16} color="#EF9F27" />
          <Text style={bkSt.extendBtnText}>Extend Break</Text>
        </Pressable>
      </View>

      <PrimaryButton title="Complete Topic" onPress={onFinish} />
    </View>
  );
}

const animSt = StyleSheet.create({
  container: { width: 190, height: 190, alignItems: "center", justifyContent: "center" },
  // Breathe
  breatheRing1: {
    position: "absolute", width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(239,159,39,0.18)", borderWidth: 1.5, borderColor: "#EF9F27",
  },
  breatheRing2: {
    position: "absolute", width: 124, height: 124, borderRadius: 62,
    borderWidth: 1.5, borderColor: "rgba(239,159,39,0.35)",
  },
  breatheRing3: {
    position: "absolute", width: 168, height: 168, borderRadius: 84,
    borderWidth: 1, borderColor: "rgba(239,159,39,0.15)",
  },
  // Water
  glass: {
    width: 52, height: 90, borderWidth: 2, borderColor: "rgba(255,255,255,0.32)",
    borderRadius: 4, overflow: "hidden", justifyContent: "flex-end",
  },
  water: { width: "100%", backgroundColor: "#38bdf8", opacity: 0.75 },
  // Eye
  eyeOuter: {
    width: 46, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  eyePupil: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#EF9F27" },
  // Figure shared
  figHead: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#EF9F27", marginBottom: 2 },
  figBody: { width: 2, height: 42, backgroundColor: "#EF9F27", marginHorizontal: 4 },
  armH: { width: 26, height: 2, backgroundColor: "#EF9F27", marginTop: 9 },
  leg: { width: 2, height: 32, backgroundColor: "#EF9F27" },
  // Mindful
  mindfulOuter: {
    position: "absolute", width: 144, height: 144, borderRadius: 72,
    borderWidth: 1.5, borderColor: "#EF9F27",
  },
  mindfulInner: {
    position: "absolute", width: 82, height: 82, borderRadius: 41,
    backgroundColor: "rgba(239,159,39,0.14)", borderWidth: 1, borderColor: "rgba(239,159,39,0.45)",
  },
  emoji: { fontSize: 28, marginTop: 10 },
});

const bkSt = StyleSheet.create({
  root: { gap: 16, paddingVertical: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(239,159,39,0.1)", borderWidth: 1,
    borderColor: "rgba(239,159,39,0.3)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: { color: "#EF9F27", fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.8 },
  timePill: {
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  timePillText: { color: "rgba(255,255,255,0.42)", fontFamily: "Inter_500Medium", fontSize: 12 },
  animArea: { alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  dots: { flexDirection: "row", gap: 5, flexWrap: "wrap", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.16)" },
  dotActive: { width: 16, height: 6, borderRadius: 3, backgroundColor: "#EF9F27" },
  tipCard: {
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)", borderRadius: 16,
    padding: 16, gap: 6,
  },
  tipLabel: { color: "#EF9F27", fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1.2 },
  tipText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
  progressWrap: { gap: 7 },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 2, overflow: "hidden" },
  progressBar: { height: 3, backgroundColor: "#EF9F27", borderRadius: 2 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressText: { color: "rgba(255,255,255,0.32)", fontFamily: "Inter_400Regular", fontSize: 11 },
  btnRow: { flexDirection: "row", gap: 10 },
  skipBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.13)",
  },
  skipBtnText: { color: "rgba(255,255,255,0.65)", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  extendBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 14, borderRadius: 14,
    backgroundColor: "rgba(239,159,39,0.1)", borderWidth: 1, borderColor: "rgba(239,159,39,0.3)",
  },
  extendBtnText: { color: "#EF9F27", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
