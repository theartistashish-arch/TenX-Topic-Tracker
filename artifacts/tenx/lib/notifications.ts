import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import { UserSettings } from "@/contexts/SettingsContext";
import { Topic } from "@/contexts/TopicsContext";
import { buildDailyPlan, formatHM } from "@/lib/dailyPlan";
import { buildStreak } from "@/lib/streak";

// ── Constants ──────────────────────────────────────────────────────────────

export const REVISION_NOTIF_PREFIX = "revision-";
export const TIMER_NOTIF_PREFIX = "timer-";
export const TOPIC_NOTIF_PREFIX = "topic-";
const SCHEDULE_KEY = "tenx.notif.lastScheduled";
const MILESTONE_KEY = "tenx.notif.milestonesNotified";
/** Re-schedule at most once every 6 hours to avoid unnecessary churn. */
const THROTTLE_MS = 6 * 60 * 60 * 1000;
/** How many days ahead to schedule. */
const DAYS_AHEAD = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MILESTONES = [10, 25, 50, 100];

function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
 * Timer alarm channel — IMPORTANCE_MAX so the notification rings and vibrates
 * even when the screen is off / locked.
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
    await Linking.openSettings().catch(() => {});
  }
}

export async function checkAllNotificationPermissions(): Promise<
  "ok" | "needs-permission" | "needs-exact-alarm" | "blocked"
> {
  if (Platform.OS === "web") return "ok";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "denied") return "blocked";
  if (status !== "granted") return "needs-permission";
  const exactOk = await canScheduleExactAlarmsAsync();
  if (!exactOk) return "needs-exact-alarm";
  return "ok";
}

// ── Cancel bulk revision notifications ────────────────────────────────────
// Only cancels revision-* prefixed notifications; does NOT touch topic-* ones.

export async function cancelRevisionNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(REVISION_NOTIF_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// ── Per-topic revision reminder ────────────────────────────────────────────

/**
 * Schedule a "📚 Revision due" notification at 8 AM on the topic's next due
 * date. Safe to call multiple times — cancels the previous one for that topic.
 * Called from receipt.tsx immediately after recordSession().
 */
export async function scheduleTopicRevisionNotification(
  topicId: string,
  topicName: string,
  subject: string,
  nextReviewAt: number,
): Promise<void> {
  if (Platform.OS === "web") return;
  const id = `${TOPIC_NOTIF_PREFIX}${topicId}`;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await ensureRevisionChannel();
  const fireDate = new Date(nextReviewAt);
  fireDate.setHours(8, 0, 0, 0);
  if (fireDate.getTime() <= Date.now() + 60_000) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `📚 Revision due: ${topicName}`,
      body: `Your ${subject} topic is ready for review today. 10 mins is all it takes!`,
      data: { screen: "/(tabs)/home" },
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: "revision",
    },
  }).catch(() => {});
}

export async function cancelTopicRevisionNotification(topicId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(
    `${TOPIC_NOTIF_PREFIX}${topicId}`,
  ).catch(() => {});
}

// ── Streak guard helpers ───────────────────────────────────────────────────

/**
 * Cancel today's 8 PM and 9 PM streak guard notifications.
 * Call this whenever the user records a study session so the guards don't
 * fire even though the user has already studied.
 */
export async function cancelTodayStreakAlert(now: number = Date.now()): Promise<void> {
  if (Platform.OS === "web") return;
  const ds = toDateStr(now);
  await Notifications.cancelScheduledNotificationAsync(
    `${REVISION_NOTIF_PREFIX}streak-8pm-${ds}`,
  ).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(
    `${REVISION_NOTIF_PREFIX}streak-9pm-${ds}`,
  ).catch(() => {});
}

// ── Comeback notification ──────────────────────────────────────────────────

const COMEBACK_ID = `${REVISION_NOTIF_PREFIX}comeback`;

/**
 * Schedule a "we miss you" notification for 9 AM, 2 days from now.
 * Cancels any previously scheduled comeback first so the countdown resets
 * on every app open.
 */
export async function scheduleComebackNotification(now: number = Date.now()): Promise<void> {
  if (Platform.OS === "web") return;
  const permitted = await requestRevisionPermission();
  if (!permitted) return;
  await ensureRevisionChannel();
  await Notifications.cancelScheduledNotificationAsync(COMEBACK_ID).catch(() => {});
  const fireDate = new Date(now + 2 * DAY_MS);
  fireDate.setHours(9, 0, 0, 0);
  if (fireDate.getTime() <= now) return;
  await Notifications.scheduleNotificationAsync({
    identifier: COMEBACK_ID,
    content: {
      title: "👋 Hey, we miss you!",
      body: "Your topics are piling up. Come back and clear your backlog — just one session counts!",
      data: { screen: "/(tabs)/home" },
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: "revision",
    },
  }).catch(() => {});
}

export async function cancelComebackNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(COMEBACK_ID).catch(() => {});
}

// ── Milestone notification ─────────────────────────────────────────────────

/**
 * Fire a celebration notification when total sessions hits 10 / 25 / 50 / 100.
 * AsyncStorage prevents duplicate fires for the same milestone.
 */
export async function checkAndScheduleMilestoneNotification(
  totalSessions: number,
): Promise<void> {
  if (Platform.OS === "web") return;
  const hit = MILESTONES.find((m) => totalSessions === m);
  if (!hit) return;
  const raw = await AsyncStorage.getItem(MILESTONE_KEY).catch(() => null);
  const notified: number[] = raw ? (JSON.parse(raw) as number[]) : [];
  if (notified.includes(hit)) return;
  const permitted = await requestRevisionPermission();
  if (!permitted) return;
  await ensureRevisionChannel();
  // Fire 5 s after scheduling so the user has navigated home first.
  const fireDate = new Date(Date.now() + 5_000);
  await Notifications.scheduleNotificationAsync({
    identifier: `${REVISION_NOTIF_PREFIX}milestone-${hit}`,
    content: {
      title: "🎉 Amazing milestone!",
      body: `You've completed ${hit} study sessions on Topter. You're absolutely on fire! 🔥`,
      data: { screen: "/(tabs)/home" },
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: "revision",
    },
  }).catch(() => {});
  await AsyncStorage.setItem(
    MILESTONE_KEY,
    JSON.stringify([...notified, hit]),
  ).catch(() => {});
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

// ── Payload builders ───────────────────────────────────────────────────────

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
 * Schedule notifications for the next DAYS_AHEAD days:
 *   07:00  Morning motivation (motivationalInsightsEnabled)
 *   08:00  Due-topics morning reminder (morningReminderEnabled)
 *   19:00  Evening reminder / streak alert (eveningReminderEnabled / streakAlertsEnabled)
 *   20:00  "Streak at risk" guard (streakAlertsEnabled)
 *   21:00  Final streak guard (streakAlertsEnabled)
 *   Sun 18:00  Weekly progress (motivationalInsightsEnabled)
 *
 * Throttled to once per THROTTLE_MS. Pass force=true to bypass (e.g. on
 * settings change).
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
  const streakAlertsOn = settings.streakAlertsEnabled !== false;
  const motivationalOn = settings.motivationalInsightsEnabled === true;

  // Weekly session count for the Sunday progress update
  const weekAgo = now - 7 * DAY_MS;
  const weeklyTopicCount = topics.filter((t) =>
    (t.sessions ?? []).some((s) => s.startedAt >= weekAgo),
  ).length;

  for (let day = 0; day < DAYS_AHEAD; day++) {
    const base = new Date(now);
    base.setDate(base.getDate() + day);
    const dateStr = toDateStr(base.getTime());

    // ── 07:00 Morning motivation ───────────────────────────────────────────
    if (motivationalOn) {
      const sevenAm = new Date(base);
      sevenAm.setHours(7, 0, 0, 0);
      if (sevenAm.getTime() > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${REVISION_NOTIF_PREFIX}motivation-7am-${dateStr}`,
          content: {
            title: "Good morning! 💪",
            body:
              dueCount > 0
                ? `You have ${dueCount} topic${dueCount > 1 ? "s" : ""} due today. Let's crush it!`
                : "Start strong — open Topter and keep your streak alive!",
            data: { screen: "/(tabs)/home" },
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.DEFAULT,
            categoryIdentifier: "revision",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: sevenAm,
            channelId: "revision",
          },
        }).catch(() => {});
      }
    }

    // ── 08:00 Due-topics morning reminder ─────────────────────────────────
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
        }).catch(() => {});
      }
    }

    // ── 19:00 Evening reminder / streak summary ────────────────────────────
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
          motivationalOn,
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
          }).catch(() => {});
        }
      }
    }

    // ── 20:00 "Streak at risk" guard ──────────────────────────────────────
    // Cancelled by cancelTodayStreakAlert() when the user records a session.
    if (streakAlertsOn) {
      const eightPm = new Date(base);
      eightPm.setHours(20, 0, 0, 0);
      if (eightPm.getTime() > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${REVISION_NOTIF_PREFIX}streak-8pm-${dateStr}`,
          content: {
            title:
              streak > 0
                ? `🔥 Your ${streak}-day streak is at risk!`
                : "Start your study streak today!",
            body: "You haven't studied yet today. Open Topter to keep it alive!",
            data: { screen: "/(tabs)/home" },
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.HIGH,
            categoryIdentifier: "revision",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: eightPm,
            channelId: "revision",
          },
        }).catch(() => {});
      }
    }

    // ── 21:00 Final streak guard ──────────────────────────────────────────
    if (streakAlertsOn) {
      const ninePm = new Date(base);
      ninePm.setHours(21, 0, 0, 0);
      if (ninePm.getTime() > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${REVISION_NOTIF_PREFIX}streak-9pm-${dateStr}`,
          content: {
            title:
              streak > 0
                ? `Last chance! Your ${streak}-day streak ends tonight.`
                : "One session. That's all it takes. 📚",
            body: "Don't let today go to waste — a quick revision session keeps the momentum going.",
            data: { screen: "/(tabs)/home" },
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.HIGH,
            categoryIdentifier: "revision",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: ninePm,
            channelId: "revision",
          },
        }).catch(() => {});
      }
    }

    // ── Sunday 18:00 Weekly progress (motivationalInsightsEnabled) ────────
    if (motivationalOn && base.getDay() === 0) {
      const sundaySixPm = new Date(base);
      sundaySixPm.setHours(18, 0, 0, 0);
      if (sundaySixPm.getTime() > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${REVISION_NOTIF_PREFIX}weekly-${dateStr}`,
          content: {
            title: "📊 Your weekly study report",
            body:
              weeklyTopicCount > 0
                ? `This week you studied ${weeklyTopicCount} topic${weeklyTopicCount === 1 ? "" : "s"}. Keep the momentum going!`
                : "This week has been quiet. Start a session today to build your streak!",
            data: { screen: "/(tabs)/home" },
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.DEFAULT,
            categoryIdentifier: "revision",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: sundaySixPm,
            channelId: "revision",
          },
        }).catch(() => {});
      }
    }
  }

  await AsyncStorage.setItem(SCHEDULE_KEY, now.toString());
}
