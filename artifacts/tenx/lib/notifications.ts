import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import { UserSettings } from "@/contexts/SettingsContext";
import { Topic, isDueToday, isOverdue } from "@/contexts/TopicsContext";
import { buildDailyPlan, formatHM } from "@/lib/dailyPlan";
import { buildStreak } from "@/lib/streak";

// ── Constants ──────────────────────────────────────────────────────────────

export const REVISION_NOTIF_PREFIX = "revision-";
export const TIMER_NOTIF_PREFIX = "timer-";
const SCHEDULE_KEY = "tenx.notif.lastScheduled";
/** Re-schedule at most once every 6 hours to avoid unnecessary churn. */
const THROTTLE_MS = 6 * 60 * 60 * 1000;
/** How many days ahead to schedule. */
const DAYS_AHEAD = 7;

// ── Identifier helpers ─────────────────────────────────────────────────────

export function isTimerNotification(id: string): boolean {
  return id.startsWith(TIMER_NOTIF_PREFIX);
}

// ── Android channels ───────────────────────────────────────────────────────

export async function ensureRevisionChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("revision", {
    name: "Revision Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#6366F1",
    sound: "default",
  });
}

/**
 * Timer alarm channel — must be IMPORTANCE_MAX so that the scheduled
 * notification rings and vibrates even when the screen is off / locked.
 * Call this before scheduling any timer notification.
 */
export async function ensureTimerChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("timer", {
    name: "Focus Timer Alarms",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    lightColor: "#22d3ee",
    sound: "default",
    enableVibrate: true,
    showBadge: false,
    // Show on lock screen and bypass DND so the alarm rings even in silent / do-not-disturb mode.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

// ── Permission ─────────────────────────────────────────────────────────────

export async function requestRevisionPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: asked } = await Notifications.requestPermissionsAsync();
  return asked === "granted";
}

/**
 * Check if the app can schedule exact alarms on Android 12+.
 * Returns true on iOS or older Android where this is not required.
 */
export async function canScheduleExactAlarmsAsync(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    // @ts-expect-error expo-notifications types may not include this yet
    const can = await Notifications.canScheduleExactNotificationsAsync?.();
    return can === true;
  } catch {
    return false;
  }
}

/** Open Android system settings to enable exact alarms for this app. */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Linking.sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", [
      { key: "android.provider.extra.APP_PACKAGE", value: "com.topter.app" },
    ]);
  } catch {
    // Fallback: open general app settings
    await Linking.openSettings().catch(() => {});
  }
}

/**
 * Full permission health check for notifications.
 * Returns a simple status string the UI can display.
 */
export async function checkAllNotificationPermissions(): Promise<
  "ok" | "needs-permission" | "needs-exact-alarm" | "blocked"
> {
  if (Platform.OS === "web") return "ok";

  // 1. Check notification permission
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "denied") return "blocked";
  if (status !== "granted") return "needs-permission";

  // 2. Check exact alarm permission (Android 12+)
  const exactOk = await canScheduleExactAlarmsAsync();
  if (!exactOk) return "needs-exact-alarm";

  return "ok";
}

// ── Cancel ─────────────────────────────────────────────────────────────────

export async function cancelRevisionNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(REVISION_NOTIF_PREFIX))
      .map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier),
      ),
  );
}

// ── Message templates ──────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function dueTitles(count: number): string {
  if (count === 1)
    return pick([
      "1 topic is waiting for revision",
      "1 topic is slipping from memory",
      "One topic needs your attention today",
    ]);
  return pick([
    `${count} topics are waiting for revision`,
    `${count} topics are slipping from memory`,
    `${count} topics need review today`,
  ]);
}

function dueBody(
  count: number,
  subjects: string[],
  estMin: number,
  streak: number,
): string {
  const time = formatHM(estMin);
  const sub = subjects.slice(0, 2).join(" & ");

  const subjectLines = sub
    ? [
        `${sub} retention is dropping — revise now.`,
        `Your ${sub} topics are due. Takes only ${time}.`,
        `Time to revisit ${sub}. Just ${time} needed.`,
      ]
    : [];

  const generic = [
    `Today's revisions take only ${time}. Keep the streak alive.`,
    `Don't let ${count} topic${count > 1 ? "s" : ""} fade. ${time} of revision ahead.`,
    streak > 1
      ? `${streak}-day streak on the line — clear your ${count} due topics.`
      : `Build your streak — ${count} topic${count > 1 ? "s" : ""} ready to review.`,
    `Quick ${time} session clears all ${count} due topics.`,
  ];

  return pick([...subjectLines, ...generic]);
}

function morningNoTopicsTitle(): string {
  return pick([
    "Good morning — revision time!",
    "Start strong, revise early.",
    "Morning brain is sharpest — time to revise.",
  ]);
}

function eveningStreakTitle(streak: number): string {
  if (streak >= 7)
    return pick([
      `${streak}-day streak at risk tonight!`,
      `Don't break your ${streak}-day run.`,
    ]);
  if (streak >= 2)
    return pick([
      `${streak}-day streak — keep going!`,
      "Your streak needs you tonight.",
    ]);
  return pick(["No revision yet today.", "Don't forget today's revision."]);
}

function insightTitle(): string {
  return pick([
    "Revision insight for today",
    "Your memory needs a nudge",
    "Smart study tip for you",
  ]);
}

function insightBody(topics: Topic[]): string {
  const hard = topics.filter((t) => t.sessions?.[0]?.difficulty === "hard");
  if (hard.length > 0) {
    const t = hard[0]!;
    return `${t.topicName} (${t.subject}) still needs work — revisit it soon.`;
  }
  const overdue = topics.filter(
    (t) => t.nextReviewAt && t.nextReviewAt < Date.now(),
  );
  if (overdue.length > 0) {
    return `${overdue.length} topic${overdue.length > 1 ? "s are" : " is"} overdue — your retention is slipping.`;
  }
  return "Consistent revision beats last-minute cramming every time.";
}

// ── Payload builder ────────────────────────────────────────────────────────

type Priority =
  | "default"
  | Notifications.AndroidNotificationPriority;

interface NotifPayload {
  title: string;
  body: string;
  priority: Notifications.AndroidNotificationPriority;
}

function buildMorningPayload(
  dueCount: number,
  dueSubjects: string[],
  estMin: number,
  streak: number,
): NotifPayload {
  if (dueCount > 0) {
    return {
      title: dueTitles(dueCount),
      body: dueBody(dueCount, dueSubjects, estMin, streak),
      priority: Notifications.AndroidNotificationPriority.HIGH,
    };
  }
  return {
    title: morningNoTopicsTitle(),
    body: "Open Topter to check your revision plan for today.",
    priority: Notifications.AndroidNotificationPriority.DEFAULT,
  };
}

function buildEveningPayload(
  dueCount: number,
  dueSubjects: string[],
  estMin: number,
  streak: number,
  streakAlertsEnabled: boolean,
  motivationalInsightsEnabled: boolean,
  topics: Topic[],
): NotifPayload | null {
  if (streakAlertsEnabled && streak >= 1 && dueCount > 0) {
    return {
      title: eveningStreakTitle(streak),
      body: dueBody(dueCount, dueSubjects, estMin, streak),
      priority: Notifications.AndroidNotificationPriority.HIGH,
    };
  }
  if (dueCount > 0) {
    return {
      title: dueTitles(dueCount),
      body: dueBody(dueCount, dueSubjects, estMin, streak),
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    };
  }
  if (motivationalInsightsEnabled) {
    return {
      title: insightTitle(),
      body: insightBody(topics),
      priority: Notifications.AndroidNotificationPriority.LOW,
    };
  }
  return null;
}

// ── Main scheduler ─────────────────────────────────────────────────────────

/**
 * Schedule up to 2 notifications per day (morning + evening) for the next
 * DAYS_AHEAD days.  Skips if permissions are denied, web platform, or the
 * master `remindersEnabled` flag is off.
 *
 * Throttled to once per THROTTLE_MS so frequent re-renders don't spam
 * the OS scheduler. Pass `force = true` to bypass the throttle (e.g. when
 * the user changes a setting).
 */
export async function scheduleDailyNotifications(
  topics: Topic[],
  settings: UserSettings,
  force = false,
  now: number = Date.now(),
): Promise<void> {
  if (Platform.OS === "web") return;

  if (!settings.remindersEnabled) {
    await cancelRevisionNotifications();
    await AsyncStorage.removeItem(SCHEDULE_KEY);
    return;
  }

  if (!force) {
    const lastRaw = await AsyncStorage.getItem(SCHEDULE_KEY);
    const lastScheduled = lastRaw ? parseInt(lastRaw, 10) : 0;
    if (now - lastScheduled < THROTTLE_MS) return;
  }

  const permitted = await requestRevisionPermission();
  if (!permitted) return;

  await ensureRevisionChannel();
  await cancelRevisionNotifications();

  const streak = buildStreak(topics, now);
  const plan = buildDailyPlan(topics, settings.dailyBudgetMin, now);
  const dueCount = plan.candidateCount;
  const estMin = plan.totalNeededMin;
  const dueSubjects = [
    ...new Set(
      [...plan.planned, ...plan.deferred].map((p) => p.topic.subject),
    ),
  ];

  const morningEnabled = settings.morningReminderEnabled !== false;
  const eveningEnabled =
    settings.eveningReminderEnabled !== false ||
    settings.streakAlertsEnabled !== false;

  for (let day = 0; day < DAYS_AHEAD; day++) {
    const base = new Date(now);
    base.setDate(base.getDate() + day);

    // ── Morning (08:00) ────────────────────────────────────────────────────
    if (morningEnabled) {
      const morning = new Date(base);
      morning.setHours(8, 0, 0, 0);
      if (morning.getTime() > now + 60_000) {
        const payload = buildMorningPayload(dueCount, dueSubjects, estMin, streak);
        await Notifications.scheduleNotificationAsync({
          identifier: `${REVISION_NOTIF_PREFIX}morning-day${day}`,
          content: {
            title: payload.title,
            body: payload.body,
            data: { screen: "/(tabs)/home" },
            sound: "default",
            priority: payload.priority,
            categoryIdentifier: "revision",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: morning,
            channelId: "revision",
          },
        });
      }
    }

    // ── Evening (19:00) ────────────────────────────────────────────────────
    if (eveningEnabled) {
      const evening = new Date(base);
      evening.setHours(19, 0, 0, 0);
      if (evening.getTime() > now + 60_000) {
        const payload = buildEveningPayload(
          dueCount,
          dueSubjects,
          estMin,
          streak,
          settings.streakAlertsEnabled !== false,
          settings.motivationalInsightsEnabled === true,
          topics,
        );
        if (payload) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${REVISION_NOTIF_PREFIX}evening-day${day}`,
            content: {
              title: payload.title,
              body: payload.body,
              data: { screen: "/(tabs)/home" },
              sound: "default",
              priority: payload.priority,
              categoryIdentifier: "revision",
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: evening,
              channelId: "revision",
            },
          });
        }
      }
    }
  }

  await AsyncStorage.setItem(SCHEDULE_KEY, now.toString());
}
