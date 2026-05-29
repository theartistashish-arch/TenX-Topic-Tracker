import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useExamMode } from "@/contexts/ExamModeContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  type StudySession,
  Topic,
  daysOverdueOf,
  isDueToday,
  isOverdue,
  useTopics,
} from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { buildCatchupPlan, buildDailyPlan, buildExamDailyPlan, formatHM } from "@/lib/dailyPlan";
import { getAbsenceDays, recordAppOpen } from "@/lib/absenceDetection";
import { buildInsights } from "@/lib/insights";
import { useSubscription } from "@/lib/revenuecat";
import { buildStreak } from "@/lib/streak";
import { FOCUS_STATE_KEY } from "@/lib/focusStorage";

type Status = "overdue" | "due" | "upcoming" | "fresh";
type PlanState = "in-plan" | "deferred" | "none";

type ListItem =
  | {
      kind: "section";
      id: string;
      title: string;
      subtitle?: string;
      count: number;
      tint: string;
    }
  | {
      kind: "topic";
      id: string;
      topic: Topic;
      status: Status;
      days: number;
      planState: PlanState;
      estMin?: number;
    }
  | {
      kind: "done";
      id: string;
      topic: Topic;
      session: StudySession;
    }
  | {
      kind: "expand";
      id: string;
      hiddenCount: number;
      expanded: boolean;
      sectionKey: "overdue" | "due";
    }
  | { kind: "empty"; id: string }
  | { kind: "vacation"; id: string };

const COLLAPSED_LIMIT = 4;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topics, isLoading: topicsLoading, rescheduleTopics, shiftAllDueDates } = useTopics();

  // ── Helpers for "Today's Plan" dashboard ─────────────────────────────────
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const isStudiedToday = useCallback(
    (t: Topic) => {
      if (!t.lastStudiedAt) return false;
      return t.lastStudiedAt >= todayStart;
    },
    [todayStart],
  );
  function subjectColor(subject: string): string {
    let h = 0;
    for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 55%)`;
  }
  function subjectBg(subject: string): string {
    let h = 0;
    for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) % 360;
    return `hsla(${h}, 70%, 55%, 0.14)`;
  }
  function subjectInitials(subject: string): string {
    return subject
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2);
  }
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { isPro, customerInfo } = useSubscription();
  const {
    examModeActive,
    examSubjects,
    examDate,
    examPhase,
    daysUntilExam,
  } = useExamMode();
  const isLoading = topicsLoading || settingsLoading;
  const [expanded, setExpanded] = useState<{ overdue: boolean; due: boolean }>({
    overdue: false,
    due: false,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [resumeTopicId, setResumeTopicId] = useState<string | null>(null);
  const [catchupVisible, setCatchupVisible] = useState(false);
  const [catchupAbsenceDays, setCatchupAbsenceDays] = useState(0);
  const catchupCheckedRef = useRef(false);
  const [resumeStateLoaded, setResumeStateLoaded] = useState(false);

  // ── 3-step contextual tooltip for first-time empty-home users ──────────────────────────────────────────
  const [tooltipStep, setTooltipStep] = useState(0);
  const tooltipCheckedRef = useRef(false);
  const emptyHome = topics.length === 0 && !isLoading;

  // ── Tappable stat-chip explanations ────────────────────────────────────────────────
  const [chipExplainer, setChipExplainer] = useState<"streak" | "studied" | "due" | "rank" | "goal" | null>(null);

  useEffect(() => {
    if (tooltipCheckedRef.current || !emptyHome) return;
    tooltipCheckedRef.current = true;
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem("tenx.homeTooltip");
        if (seen) return;
        const onboarded = await AsyncStorage.getItem("tenx.onboarded");
        if (onboarded) {
          setTooltipStep(1);
        }
      } catch {
        // ignore
      }
    })();
  }, [emptyHome]);

  const advanceTooltip = () => {
    if (tooltipStep >= 3) {
      setTooltipStep(0);
      void AsyncStorage.setItem("tenx.homeTooltip", "1");
    } else {
      setTooltipStep(tooltipStep + 1);
    }
  };
  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;
  const streak = useMemo(() => buildStreak(topics), [topics]);
  const insights = useMemo(() => buildInsights(topics), [topics]);
  const [rankModalOpen, setRankModalOpen] = useState(false);
  const todayMin = useMemo(() => {
    const nowTs = Date.now();
    const today = new Date(nowTs);
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    let m = 0;
    for (const t of topics) {
      for (const s of t.sessions ?? []) {
        const sd = new Date(s.startedAt);
        sd.setHours(0, 0, 0, 0);
        if (sd.getTime() === todayStart) m += s.minutes ?? 0;
      }
    }
    return m;
  }, [topics]);
  const goalPct = settings.dailyBudgetMin > 0
    ? Math.min(100, Math.round((todayMin / settings.dailyBudgetMin) * 100))
    : 0;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web") {
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
          BackHandler.exitApp();
          return true;
        });
        return () => sub.remove();
      }
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(FOCUS_STATE_KEY).then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as { topicId: string };
            setResumeTopicId(saved.topicId ?? null);
          } catch {
            setResumeTopicId(null);
          }
        } else {
          setResumeTopicId(null);
        }
        setResumeStateLoaded(true);
      }).catch(() => {
        if (active) {
          setResumeTopicId(null);
          setResumeStateLoaded(true);
        }
      });
      return () => { active = false; };
    }, []),
  );

  const { overdueList, dueList, freshList, todayList, totalBacklog, todayDoneList } =
    useMemo(() => {
      const now = Date.now();
      const overdue: { topic: Topic; days: number }[] = [];
      const due: Topic[] = [];
      const fresh: Topic[] = [];
      const today: Topic[] = [];
      const done: { topic: Topic; session: StudySession }[] = [];
      for (const t of topics) {
        // Suspended topics are invisible in the queue
        if (t.suspendedUntil && t.suspendedUntil > now) continue;
        if (isStudiedToday(t)) {
          const session = (t.sessions ?? [])[0];
          if (session) done.push({ topic: t, session });
          continue;
        }
        if (!t.nextReviewAt) fresh.push(t);
        else if (isOverdue(t, now))
          overdue.push({ topic: t, days: daysOverdueOf(t, now) });
        else if (isDueToday(t, now)) {
          due.push(t);
          today.push(t);
        }
      }
      overdue.sort((a, b) => b.days - a.days);
      due.sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
      today.sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0));
      return {
        overdueList: overdue,
        dueList: due,
        freshList: fresh,
        todayList: today,
        totalBacklog: overdue.length + due.length,
        todayDoneList: done,
      };
    }, [topics, isStudiedToday]);

  const vacationActive = settings.vacationSince !== null;

  const dailyPlan = useMemo(
    () =>
      examModeActive && examDate && (examPhase === "active" || examPhase === "eve")
        ? buildExamDailyPlan(topics, examSubjects, examDate, examPhase, settings.dailyBudgetMin)
        : buildDailyPlan(topics, settings.dailyBudgetMin, Date.now(), vacationActive),
    [topics, settings.dailyBudgetMin, examModeActive, examSubjects, examDate, examPhase, vacationActive],
  );
  const planLookup = useMemo(() => {
    const map = new Map<string, { state: PlanState; estMin: number }>();
    dailyPlan.planned.forEach((p) =>
      map.set(p.topic.id, { state: "in-plan", estMin: p.estMin }),
    );
    dailyPlan.deferred.forEach((p) =>
      map.set(p.topic.id, { state: "deferred", estMin: p.estMin }),
    );
    return map;
  }, [dailyPlan]);

  // ── Catch-up Mode: absence detection ───────────────────────────────────────
  // Runs once per app session, but only after topics, settings, AND the async
  // resume-state load have all completed. The ref prevents a second run even
  // when deps change after the first successful check.
  useFocusEffect(
    useCallback(() => {
      if (catchupCheckedRef.current) return;
      // Exit WITHOUT marking checked so we retry once deps finish hydrating.
      if (isLoading || !resumeStateLoaded || vacationActive) return;

      catchupCheckedRef.current = true;

      void (async () => {
        const days = await getAbsenceDays();
        await recordAppOpen();
        // Show for any overdue/due backlog after ≥5 days, not only when the
        // deferred tail is non-empty — the backlog may fit today's plan entirely.
        if (days >= 5 && dailyPlan.candidateCount > 0 && resumeTopicId === null) {
          setCatchupAbsenceDays(days);
          setCatchupVisible(true);
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, resumeStateLoaded, vacationActive, resumeTopicId, dailyPlan.candidateCount]),
  );

  const data = useMemo<ListItem[]>(() => {
    // ── Vacation Mode: replace topic list with a pause card ─────────────────
    if (dailyPlan.schedulePaused) {
      return [{ kind: "vacation", id: "vacation" }];
    }

    const items: ListItem[] = [];
    const buildTopic = (
      topic: Topic,
      status: Status,
      days: number,
    ): ListItem => {
      const entry = planLookup.get(topic.id);
      return {
        kind: "topic",
        id: `t-${topic.id}`,
        topic,
        status,
        days,
        planState: entry?.state ?? "none",
        estMin: entry?.estMin,
      };
    };
    const pushCollapsed = <T,>(
      arr: T[],
      sectionKey: "overdue" | "due",
      build: (t: T, i: number) => ListItem,
    ) => {
      const isExp = expanded[sectionKey];
      const visible = isExp ? arr : arr.slice(0, COLLAPSED_LIMIT);
      visible.forEach((t, i) => items.push(build(t, i)));
      const hidden = arr.length - visible.length;
      if (arr.length > COLLAPSED_LIMIT)
        items.push({
          kind: "expand",
          id: `expand-${sectionKey}`,
          hiddenCount: hidden,
          expanded: isExp,
          sectionKey,
        });
    };

    // ── Exam Mode: single priority-ordered queue ────────────────────────────
    if (examModeActive && (examPhase === "active" || examPhase === "eve")) {
      const { planned, deferred } = dailyPlan;
      if (planned.length > 0) {
        const subtitle =
          examPhase === "eve"
            ? "Important fast-recall topics only."
            : "Prioritised by difficulty & importance.";
        items.push({
          kind: "section",
          id: "sec-exam-queue",
          title: "Exam revision queue",
          subtitle,
          count: planned.length,
          tint: "#a855f7",
        });
        for (const item of planned)
          items.push(buildTopic(item.topic, item.status, item.daysOverdue));
      }
      if (deferred.length > 0) {
        items.push({
          kind: "section",
          id: "sec-exam-deferred",
          title: "Deferred",
          subtitle: "Over daily budget — do these tomorrow.",
          count: deferred.length,
          tint: "#6b7280",
        });
        for (const item of deferred)
          items.push(buildTopic(item.topic, item.status, item.daysOverdue));
      }
      if (items.length === 0) items.push({ kind: "empty", id: "empty" });
      return items;
    }

    // ── Normal mode: render only the capped daily plan so the queue never
    //    feels overwhelming. Excess topics are deferred and shown as a summary.
    const overdueFromPlan = dailyPlan.planned.filter((p) => p.status === "overdue");
    const dueFromPlan = dailyPlan.planned.filter((p) => p.status === "due");

    if (overdueFromPlan.length > 0) {
      items.push({
        kind: "section",
        id: "sec-overdue",
        title: "Overdue",
        subtitle: "Catch up first.",
        count: overdueFromPlan.length,
        tint: colors.destructive,
      });
      pushCollapsed(overdueFromPlan, "overdue", (item) =>
        buildTopic(item.topic, "overdue", item.daysOverdue),
      );
    }
    if (dueFromPlan.length > 0) {
      items.push({
        kind: "section",
        id: "sec-due",
        title: "Today's revision",
        subtitle: "Finish these now.",
        count: dueFromPlan.length,
        tint: "#f59e0b",
      });
      pushCollapsed(dueFromPlan, "due", (item) => buildTopic(item.topic, "due", 0));
    }
    // Show a calm deferred-count summary without expanding it into the list.
    if (dailyPlan.deferred.length > 0) {
      items.push({
        kind: "section",
        id: "sec-deferred",
        title: "Queued for later",
        subtitle: `${dailyPlan.deferred.length} more topic${dailyPlan.deferred.length !== 1 ? "s" : ""} spread across the coming days.`,
        count: dailyPlan.deferred.length,
        tint: "#6b7280",
      });
    }
    if (todayDoneList.length > 0) {
      items.push({
        kind: "section",
        id: "sec-done",
        title: "Studied today",
        subtitle: "Your work is saved here all day.",
        count: todayDoneList.length,
        tint: "#22c55e",
      });
      for (const d of todayDoneList)
        items.push({
          kind: "done",
          id: `done-${d.topic.id}`,
          topic: d.topic,
          session: d.session,
        });
    }
    if (freshList.length > 0) {
      items.push({
        kind: "section",
        id: "sec-fresh",
        title: "Fresh",
        count: freshList.length,
        tint: "#22d3ee",
      });
      for (const topic of freshList) items.push(buildTopic(topic, "fresh", 0));
    }
    if (items.length === 0) items.push({ kind: "empty", id: "empty" });
    return items;
  }, [overdueList, dueList, freshList, todayDoneList, expanded, colors, planLookup, examModeActive, examPhase, dailyPlan]);

  const handleStartNewTopic = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push("/new-topic");
  };
  const handleToggle = (key: "overdue" | "due") =>
    setExpanded((s) => ({ ...s, [key]: !s[key] }));
  const handleStartPlan = () => {
    const target =
      dailyPlan.planned[0]?.topic ?? overdueList[0]?.topic ?? dueList[0];
    if (!target) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push({ pathname: "/focus", params: { topicId: target.id } });
  };
  if (isLoading) {
    return (
      <View
        style={[
          styles.root,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Exam Day: calm full-screen motivational state ──────────────────────────
  if (examModeActive && examPhase === "day") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Top bar */}
        <View style={[styles.fixedHeader, { paddingTop: topInset + 6, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={styles.menuBtn}>
              <Feather name="menu" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.brandBlock}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, color: "#22d3ee" }}>Topter</Text>
            </View>
          </View>
        </View>

        {/* Motivational full-screen */}
        <View style={[styles.centered, { flex: 1, paddingHorizontal: 32, gap: 24 }]}>
          <Text style={{ fontSize: 72 }}>🎯</Text>
          <View style={{ gap: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: "#c4b5fd", letterSpacing: -0.5, textAlign: "center" }}>
              Exam Day!
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 16, color: "#94a3b8", textAlign: "center", lineHeight: 24 }}>
              You've put in the work. Trust your preparation — today is your moment to shine.
            </Text>
          </View>
          <View style={{ gap: 12, width: "100%" }}>
            {examSubjects.map((s) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#7c3aed22", borderWidth: 1, borderColor: "#7c3aed44", borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 18 }}>⚡</Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#c4b5fd", flex: 1 }} numberOfLines={1}>{s}</Text>
                <Feather name="check" size={16} color="#7c3aed" />
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#475569", textAlign: "center", marginTop: 8 }}>
            No revision scheduled today — rest and focus on your exam.
          </Text>
        </View>

        <PlanValidityModal visible={planModalOpen} customerInfo={customerInfo} onClose={() => setPlanModalOpen(false)} />
        <AboutModal visible={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
        <MenuSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          isPro={isPro}
          onShowPlan={() => setPlanModalOpen(true)}
          onShowAbout={() => setAboutModalOpen(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Fixed top bar ── */}
      <View style={[styles.fixedHeader, { paddingTop: topInset + 6, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={12}
            style={styles.menuBtn}
          >
            <Feather name="menu" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.brandBlock}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, color: "#22d3ee" }}>
              Topter
            </Text>
            {isPro ? (
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, color: "#f97316" }}>
                Pro
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* ── Scrollable list ── */}
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: bottomInset + 28,
          paddingHorizontal: 18,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.greetBlock}>
              <Text style={[styles.greetEyebrow, { color: colors.mutedForeground }]}></Text>
              <Text style={[styles.greetTitle, { color: colors.foreground }]}>
                Today's plan
              </Text>
            </View>

            {/* Exam countdown banner */}
            {examModeActive && examPhase !== "ended" ? (
              examPhase === "day" ? (
                <View style={[styles.examBanner, { backgroundColor: "#7c3aed22", borderColor: "#7c3aed" }]}>
                  <Text style={styles.examBannerIcon}>🎯</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.examBannerTitle, { color: "#c4b5fd" }]}>Exam Day!</Text>
                    <Text style={[styles.examBannerSub, { color: "#a78bfa" }]}>
                      You've prepared well. Trust your preparation — go conquer it!
                    </Text>
                  </View>
                </View>
              ) : examPhase === "eve" ? (
                <View style={[styles.examBanner, { backgroundColor: "#f59e0b22", borderColor: "#f59e0b" }]}>
                  <Text style={styles.examBannerIcon}>⚡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.examBannerTitle, { color: "#fbbf24" }]}>Exam Eve!</Text>
                    <Text style={[styles.examBannerSub, { color: "#f59e0b" }]}>
                      Light revision only today. Review your starred topics, rest well.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.examBanner, { backgroundColor: "#0ea5e922", borderColor: "#0ea5e9" }]}>
                  <Feather name="clock" size={18} color="#38bdf8" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.examBannerTitle, { color: "#38bdf8" }]}>
                      {daysUntilExam != null ? `${daysUntilExam}d to exam` : "Exam Mode Active"}
                    </Text>
                    <Text style={[styles.examBannerSub, { color: "#7dd3fc" }]}>
                      Focus on: {examSubjects.slice(0, 2).join(", ")}{examSubjects.length > 2 ? ` +${examSubjects.length - 2} more` : ""}
                    </Text>
                  </View>
                </View>
              )
            ) : null}

            <View style={styles.topRow}>
              <SmallChip label={`${streak} day streak`} icon="zap" onPress={() => setChipExplainer("streak")} />
              <SmallChip label={`${todayDoneList.length} studied`} icon="check-circle" onPress={() => setChipExplainer("studied")} />
              <SmallChip label={`${todayList.length} due`} icon="clock" onPress={() => setChipExplainer("due")} />
              <SmallChip label={`${goalPct}% goal`} icon="target" onPress={() => setChipExplainer("goal")} />
            </View>
            {/* ── Daily progress bar ── */}
            {(() => {
              const totalPlan = dailyPlan.planned.length + todayDoneList.length;
              const doneCount = todayDoneList.length;
              const pct = totalPlan > 0 ? doneCount / totalPlan : 0;
              const allDone = totalPlan > 0 && doneCount >= totalPlan;
              return (
                <>
                  <View style={styles.progressWrap}>
                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.round(pct * 100)}%`,
                            backgroundColor: allDone ? "#22c55e" : colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                      {allDone
                        ? `${doneCount} of ${totalPlan} done — great work!`
                        : `${doneCount} of ${totalPlan} tasks done today`}
                    </Text>
                  </View>
                  {allDone ? (
                    <View style={[styles.allDoneBanner, { backgroundColor: "#22c55e14", borderColor: "#22c55e44" }]}>
                      <Text style={{ fontSize: 18 }}>🎉</Text>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.allDoneTitle, { color: "#22c55e" }]}>All done for today!</Text>
                        <Text style={[styles.allDoneSub, { color: "#16a34a" }]}>
                          {todayDoneList.length} topic{todayDoneList.length !== 1 ? "s" : ""} studied · {formatHM(todayMin)} focused
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </>
              );
            })()}
            {chipExplainer && (
              <Pressable onPress={() => setChipExplainer(null)} style={styles.chipExplainerWrap}>
                <View style={[styles.chipExplainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.chipExplainerText, { color: colors.foreground }]}>
                    {chipExplainer === "streak" && "Consecutive days you've studied on Topter. Tap any topic to keep it going."}
                    {chipExplainer === "studied" && "Topics you've completed today. They stay here until midnight so you can see your progress."}
                    {chipExplainer === "due" && "Topics scheduled for revision today based on how well you remembered them last time."}
                    {chipExplainer === "rank" && "Estimated percentile vs other Topter users with the same daily study goal."}
                    {chipExplainer === "goal" && "How much of your daily study target you've completed so far today."}
                  </Text>
                </View>
              </Pressable>
            )}
            <Pressable
              onPress={handleStartNewTopic}
              style={({ pressed }) => [
                styles.ctaWrap,
                { opacity: pressed ? 0.94 : 1 },
              ]}
            >
              <LinearGradient
                colors={["#4f46e5", "#22d3ee"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <View style={styles.ctaIconCircle}>
                  <Feather name="plus" size={24} color="#ffffff" />
                </View>
                <Text style={styles.ctaTitle}>New topic</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "section") {
            return (
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.sectionTitleRow}>
                    <View
                      style={[
                        styles.sectionDot,
                        { backgroundColor: item.tint },
                      ]}
                    />
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.title}
                    </Text>
                  </View>
                  {item.subtitle ? (
                    <Text
                      style={[
                        styles.sectionSubtitle,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.sectionCount,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {item.count}
                </Text>
              </View>
            );
          }
          if (item.kind === "expand") {
            return (
              <Pressable
                onPress={() => handleToggle(item.sectionKey)}
                style={({ pressed }) => [
                  styles.expandBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather
                  name={item.expanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.expandText, { color: colors.primary }]}>
                  {item.expanded ? "Show less" : `+${item.hiddenCount} more`}
                </Text>
              </Pressable>
            );
          }
          if (item.kind === "vacation") {
            return (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.card, borderColor: "#0ea5e9", borderWidth: 1.5 },
                ]}
              >
                <Text style={{ fontSize: 36 }}>🏖️</Text>
                <Text style={[styles.emptyTitle, { color: "#38bdf8" }]}>
                  Schedule paused
                </Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Your streak is safe. Revision dates will shift forward when you resume.
                </Text>
                <Pressable
                  onPress={async () => {
                    const since = settings.vacationSince;
                    if (since !== null) {
                      await shiftAllDueDates(Date.now() - since);
                    }
                    void updateSettings({ vacationSince: null });
                  }}
                  style={({ pressed }) => [
                    styles.vacationResumeBtn,
                    { backgroundColor: "#0ea5e9", opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Feather name="play" size={14} color="#fff" />
                  <Text style={styles.vacationResumeText}>Resume</Text>
                </Pressable>
              </View>
            );
          }
          if (item.kind === "empty") {
            return (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather
                  name="book-open"
                  size={28}
                  color={colors.mutedForeground}
                />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  Revision schedule
                </Text>
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  Your topics will appear here
                </Text>
              </View>
            );
          }
          if (item.kind === "done") {
            return (
              <DoneRow topic={item.topic} session={item.session} />
            );
          }
          return (
            <TopicRow
              topic={item.topic}
              status={item.status}
              days={item.days}
              planState={item.planState}
              estMin={item.estMin}
              hasResume={resumeTopicId === item.topic.id}
            />
          );
        }}
      />
      {/* ── 3-step contextual tooltip overlay ──────────────────────────────────────────────── */}
      {tooltipStep > 0 && (
        <Pressable onPress={advanceTooltip} style={tooltipOverlayStyles.overlay}>
          <View style={tooltipOverlayStyles.card}>
            <View style={tooltipOverlayStyles.dots}>
              {[1, 2, 3].map((s) => (
                <View
                  key={s}
                  style={[
                    tooltipOverlayStyles.dot,
                    { backgroundColor: s === tooltipStep ? "#22d3ee" : "rgba(255,255,255,0.25)" },
                  ]}
                />
              ))}
            </View>
            <Text style={tooltipOverlayStyles.title}>
              {tooltipStep === 1 && "Tap New topic to log what you're studying"}
              {tooltipStep === 2 && "Your focus timer starts automatically"}
              {tooltipStep === 3 && "Topter will remind you when to revise"}
            </Text>
            <Text style={tooltipOverlayStyles.hint}>Tap anywhere to continue</Text>
          </View>
        </Pressable>
      )}

      <RankModal
        visible={rankModalOpen}
        rankChance={insights.rankChance}
        rankLabel={insights.rankLabel}
        onClose={() => setRankModalOpen(false)}
      />
      <PlanValidityModal
        visible={planModalOpen}
        customerInfo={customerInfo}
        onClose={() => setPlanModalOpen(false)}
      />
      <AboutModal
        visible={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
      />
      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        isPro={isPro}
        onShowPlan={() => setPlanModalOpen(true)}
        onShowAbout={() => setAboutModalOpen(true)}
      />
      <CatchupBottomSheet
        visible={catchupVisible}
        absenceDays={catchupAbsenceDays}
        backlogCount={dailyPlan.candidateCount}
        todayCount={dailyPlan.planned.length}
        firstTopicId={dailyPlan.planned[0]?.topic.id ?? null}
        onStartSession={() => {
          setCatchupVisible(false);
          void rescheduleTopics(buildCatchupPlan(dailyPlan.deferred, dailyPlan.planned.length));
          const target = dailyPlan.planned[0]?.topic;
          if (target) router.push({ pathname: "/focus", params: { topicId: target.id } });
        }}
        onDismiss={() => {
          setCatchupVisible(false);
          void rescheduleTopics(buildCatchupPlan(dailyPlan.deferred, dailyPlan.planned.length));
        }}
      />
    </View>
  );
}

function RankModal({
  visible,
  rankChance,
  rankLabel,
  onClose,
}: {
  visible: boolean;
  rankChance: number;
  rankLabel: string;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={rankModalStyles.backdrop} onPress={onClose}>
        <Pressable style={[rankModalStyles.sheet, { backgroundColor: colors.card }]} onPress={() => null}>
          <View style={rankModalStyles.handle} />
          <Text style={[rankModalStyles.title, { color: colors.foreground }]}>
            Rank chance
          </Text>
          <Text style={[rankModalStyles.number, { color: colors.primary }]}>
            {rankChance}%
          </Text>
          <Text style={[rankModalStyles.label, { color: colors.foreground }]}>
            {rankLabel}
          </Text>
          <Text style={[rankModalStyles.body, { color: colors.mutedForeground }]}>
            Your rank chance is a heuristic score that blends four study habits:
            weekly hours, consistency (active days per week), on-time reviews, and
            focus stamina (fewer pauses = higher score). Finish sessions on time,
            study daily, and pause less to push it up. It resets to 0 if you
            take a break longer than one day.
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              rankModalStyles.doneBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={rankModalStyles.doneText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlanValidityModal({
  visible,
  customerInfo,
  onClose,
}: {
  visible: boolean;
  customerInfo: { entitlements?: { active?: Record<string, { expirationDate?: string | null }> } } | null | undefined;
  onClose: () => void;
}) {
  const colors = useColors();
  const activeEnt = customerInfo?.entitlements?.active;
  const proEnt = activeEnt?.["pro"];
  const expiration = proEnt?.expirationDate;

  const formattedDate = expiration
    ? new Date(expiration).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={rankModalStyles.backdrop} onPress={onClose}>
        <Pressable style={[rankModalStyles.sheet, { backgroundColor: colors.card }]} onPress={() => null}>
          <View style={rankModalStyles.handle} />
          <Feather name="shield" size={36} color="#f97316" style={{ alignSelf: "center", marginBottom: 12 }} />
          <Text style={[rankModalStyles.title, { color: colors.foreground }]}>
            Topter Pro
          </Text>
          <Text style={[rankModalStyles.number, { color: "#f97316" }]}>
            Active
          </Text>
          {formattedDate ? (
            <Text style={[rankModalStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}>
              Your Pro plan is valid until{"\n"}
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                {formattedDate}
              </Text>
            </Text>
          ) : (
            <Text style={[rankModalStyles.body, { color: colors.mutedForeground, textAlign: "center" }]}>
              Your Pro plan is active with no expiration date.
            </Text>
          )}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              rankModalStyles.doneBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={rankModalStyles.doneText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AboutModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={rankModalStyles.backdrop} onPress={onClose}>
        <Pressable style={[rankModalStyles.sheet, { backgroundColor: colors.card }]} onPress={() => null}>
          <View style={rankModalStyles.handle} />
          <Feather name="book-open" size={32} color={colors.primary} style={{ alignSelf: "center", marginBottom: 12 }} />
          <Text style={[rankModalStyles.title, { color: colors.foreground }]}>
            About Topter
          </Text>
          <Text style={[rankModalStyles.body, { color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }]}>
            Topter is a daily revision companion for serious students preparing for UPSC, NEET, JEE, SSC, Banking, and every competitive exam.{"\n\n"}
            We help you track every topic, remind you when to revise using spaced repetition, and show how your daily effort adds up over time.{"\n\n"}
            Built by the Topter Team.
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              rankModalStyles.doneBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={rankModalStyles.doneText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CatchupBottomSheet({
  visible,
  absenceDays,
  backlogCount,
  todayCount,
  firstTopicId,
  onStartSession,
  onDismiss,
}: {
  visible: boolean;
  absenceDays: number;
  backlogCount: number;
  todayCount: number;
  firstTopicId: string | null;
  onStartSession: () => void;
  onDismiss: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={rankModalStyles.backdrop} onPress={onDismiss}>
        <Pressable style={[rankModalStyles.sheet, { backgroundColor: colors.card, gap: 0 }]} onPress={() => null}>
          <View style={rankModalStyles.handle} />
          <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 10 }}>👋</Text>
          <Text style={[rankModalStyles.title, { color: colors.foreground, marginBottom: 6 }]}>
            Welcome back!
          </Text>
          <Text style={[rankModalStyles.body, { color: colors.mutedForeground, textAlign: "center", marginBottom: 18 }]}>
            You were away for {absenceDays} day{absenceDays !== 1 ? "s" : ""}.{" "}
            {backlogCount} topic{backlogCount !== 1 ? "s" : ""} piled up — we've surfaced{" "}
            {todayCount} for today and will spread the rest across the coming days.
          </Text>
          {firstTopicId !== null && (
            <Pressable
              onPress={onStartSession}
              style={({ pressed }) => [
                catchupStyles.primaryBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="zap" size={16} color="#fff" />
              <Text style={catchupStyles.primaryBtnText}>Start catch-up session</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              catchupStyles.dismissBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[catchupStyles.dismissText, { color: colors.mutedForeground }]}>
              Maybe later
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const catchupStyles = StyleSheet.create({
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  dismissBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  dismissText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});

function MenuSheet({
  visible,
  onClose,
  isPro,
  onShowPlan,
  onShowAbout,
}: {
  visible: boolean;
  onClose: () => void;
  isPro: boolean;
  onShowPlan: () => void;
  onShowAbout: () => void;
}) {
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { topics } = useTopics();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 20) : insets.bottom;

  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const initials = useMemo(() => {
    const n = currentUser?.name?.trim() || currentUser?.email || "?";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p: string) => p.charAt(0).toUpperCase()).join("") || "?";
  }, [currentUser]);

  const streak = useMemo(() => buildStreak(topics), [topics]);
  const totalTopics = topics.length;
  const dueCount = useMemo(() => {
    const now = Date.now();
    return topics.filter((t) => t.nextReviewAt && t.nextReviewAt <= now).length;
  }, [topics]);

  const navigate = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace("/login");
  };

  const handleShowPlan = () => {
    onClose();
    onShowPlan();
  };

  const handleShowAbout = () => {
    onClose();
    onShowAbout();
  };

  const handleShare = () => {
    Share.share({
      message:
        "I'm using Topter to track, revise & remember my exam topics. Check it out!",
      title: "Topter — Track, Revise, Remember",
    }).catch(() => {});
  };

  const handleContact = () => {
    Linking.openURL("mailto:toptersupport@gmail.com?subject=Topter%20Support").catch(
      () => {},
    );
  };

  const handleRate = () => {
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.topter.app";
    const marketUrl = "market://details?id=com.topter.app";
    if (Platform.OS === "android") {
      Linking.canOpenURL(marketUrl).then((can) => {
        if (can) {
          Linking.openURL(marketUrl).catch(() => {});
        } else {
          Linking.openURL(playStoreUrl).catch(() => {});
        }
      }).catch(() => {
        Linking.openURL(playStoreUrl).catch(() => {});
      });
    } else {
      Linking.openURL(playStoreUrl).catch(() => {});
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[drawerStyles.backdrop, { opacity: fadeAnim }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          drawerStyles.drawer,
          {
            paddingTop: topInset + 16,
            paddingBottom: bottomInset + 8,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* ── Profile header ── */}
        <Pressable
          onPress={() => navigate("/profile")}
          style={({ pressed }) => [
            drawerStyles.profileSection,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <LinearGradient
            colors={["#0ea5e9", "#22d3ee"]}
            style={drawerStyles.avatar}
          >
            <Text style={drawerStyles.avatarText}>{initials}</Text>
          </LinearGradient>
          <View style={drawerStyles.profileInfo}>
            <Text style={drawerStyles.profileName} numberOfLines={1}>
              {currentUser?.name || "Aspirant"}
            </Text>
            <Text style={drawerStyles.profileGoal} numberOfLines={1}>
              {currentUser?.examGoal || "Goal"}
              {currentUser?.city ? ` · ${currentUser.city}` : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => navigate("/settings")}
            hitSlop={10}
            style={({ pressed }) => [
              drawerStyles.settingsBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather name="settings" size={18} color="#22d3ee" />
          </Pressable>
        </Pressable>

        {/* ── Stats chips ── */}
        <View style={drawerStyles.statsRow}>
          <View style={drawerStyles.statChip}>
            <Feather name="zap" size={12} color="#f59e0b" />
            <Text style={drawerStyles.statChipText}>{streak}d streak</Text>
          </View>
          <View style={drawerStyles.statChip}>
            <Feather name="book-open" size={12} color="#22d3ee" />
            <Text style={drawerStyles.statChipText}>{totalTopics} topics</Text>
          </View>
          <View style={drawerStyles.statChip}>
            <Feather name="clock" size={12} color="#a78bfa" />
            <Text style={drawerStyles.statChipText}>{dueCount} due</Text>
          </View>
        </View>

        <View style={drawerStyles.divider} />

        {/* ── Upgrade / Plan Validity ── */}
        {isPro ? (
          <Pressable
            onPress={handleShowPlan}
            style={({ pressed }) => [
              drawerStyles.upgradeWrap,
              { opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <LinearGradient
              colors={["#4f46e5", "#22d3ee"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={drawerStyles.upgradeGradient}
            >
              <Feather name="shield" size={15} color="#fff" />
              <Text style={drawerStyles.upgradeText}>View Plan Validity</Text>
              <Feather
                name="chevron-right"
                size={15}
                color="rgba(255,255,255,0.7)"
              />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => navigate("/paywall")}
            style={({ pressed }) => [
              drawerStyles.upgradeWrap,
              { opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <LinearGradient
              colors={["#4f46e5", "#22d3ee"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={drawerStyles.upgradeGradient}
            >
              <Feather name="star" size={15} color="#fff" />
              <Text style={drawerStyles.upgradeText}>Upgrade to Pro</Text>
              <Feather
                name="chevron-right"
                size={15}
                color="rgba(255,255,255,0.7)"
              />
            </LinearGradient>
          </Pressable>
        )}

        <View style={drawerStyles.divider} />

        {/* ── Secondary links ── */}
        <DrawerItem
          icon="mail"
          label="Contact Us"
          onPress={handleContact}
          small
        />
        <DrawerItem
          icon="star"
          label="Rate the App"
          onPress={handleRate}
          small
        />
        <DrawerItem
          icon="share-2"
          label="Share Topter"
          onPress={handleShare}
          small
        />
        <DrawerItem
          icon="info"
          label="About Us"
          onPress={handleShowAbout}
          small
        />

        <View style={{ flex: 1 }} />

        {/* ── Logout + version ── */}
        <View style={drawerStyles.divider} />
        <DrawerItem
          icon="log-out"
          label="Log Out"
          onPress={handleLogout}
          danger
          small
        />
        <Text style={drawerStyles.version}>Topter v1.0</Text>
      </Animated.View>
    </Modal>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
  danger,
  small,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        drawerStyles.drawerItem,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Feather
        name={icon}
        size={small ? 15 : 17}
        color={danger ? "#f87171" : "#22d3ee"}
      />
      <Text
        style={[
          drawerStyles.drawerItemText,
          small && drawerStyles.drawerItemTextSmall,
          danger && drawerStyles.drawerItemDanger,
        ]}
      >
        {label}
      </Text>
      {!small && !danger && (
        <Feather
          name="chevron-right"
          size={14}
          color="rgba(255,255,255,0.22)"
          style={{ marginLeft: "auto" }}
        />
      )}
    </Pressable>
  );
}

function SmallChip({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
}) {
  const colors = useColors();
  const chip = (
    <View
      style={[
        styles.chip,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Feather name={icon} size={12} color={colors.primary} />
      <Text style={[styles.chipText, { color: colors.foreground }]}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return chip;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      {chip}
    </Pressable>
  );
}

function TopicRow({
  topic,
  status,
  days,
  planState,
  estMin,
  hasResume,
}: {
  topic: Topic;
  status: Status;
  days: number;
  planState: PlanState;
  estMin?: number;
  hasResume?: boolean;
}) {
  const colors = useColors();
  const router = useRouter();
  const handleResume = () =>
    router.push({ pathname: "/focus", params: { topicId: topic.id } });
  const meta = (() => {
    if (status === "overdue")
      return {
        badgeLabel: `${days}d late`,
        badgeColor: colors.destructive,
        sub: topic.nextReviewAt
          ? `Due ${new Date(topic.nextReviewAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
          : "",
      };
    if (status === "due")
      return { badgeLabel: "Today", badgeColor: "#f59e0b", sub: "Open now" };
    if (status === "upcoming" && topic.nextReviewAt) {
      const d = new Date(topic.nextReviewAt);
      return {
        badgeLabel: null as string | null,
        badgeColor: colors.primary,
        sub: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      };
    }
    return { badgeLabel: "New", badgeColor: "#22d3ee", sub: "Fresh" };
  })();
  const isInPlan = planState === "in-plan";
  const isDeferred = planState === "deferred";
  const borderColor = isDeferred
    ? colors.border
    : status === "overdue"
      ? colors.destructive
      : status === "due"
        ? "#f59e0b"
        : colors.border;
  const borderWidth =
    !isDeferred && (status === "overdue" || status === "due") ? 1.5 : 1;
  return (
    <Pressable
      onPress={handleResume}
      style={({ pressed }) => [
        styles.topicCard,
        {
          backgroundColor: colors.card,
          borderColor,
          borderWidth,
          opacity: pressed ? 0.9 : isDeferred ? 0.72 : 1,
        },
      ]}
    >
      <SubjectAvatar subject={topic.subject} />
      <View style={styles.topicTextWrap}>
        <View style={styles.topicTopRow}>
          <Text
            style={[styles.topicSubject, { color: colors.primary }]}
            numberOfLines={1}
          >
            {topic.subject}
          </Text>
          <View style={styles.badgeStack}>
            {hasResume ? (
              <View
                style={[
                  styles.dueBadge,
                  {
                    backgroundColor: "rgba(99,102,241,0.18)",
                    borderColor: "#6366f1",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                  },
                ]}
              >
                <Feather name="play" size={9} color="#818cf8" />
                <Text style={[styles.dueBadgeText, { color: "#818cf8" }]}>
                  Resume
                </Text>
              </View>
            ) : null}
            {isInPlan ? (
              <View
                style={[
                  styles.dueBadge,
                  {
                    backgroundColor: "rgba(34,211,238,0.15)",
                    borderColor: "#22d3ee",
                  },
                ]}
              >
                <Text style={[styles.dueBadgeText, { color: "#0e7490" }]}>
                  In plan{estMin ? ` · ${estMin}m` : ""}
                </Text>
              </View>
            ) : null}
            {isDeferred ? (
              <View
                style={[
                  styles.dueBadge,
                  {
                    backgroundColor: "rgba(100,116,139,0.15)",
                    borderColor: "#94a3b8",
                  },
                ]}
              >
                <Text style={[styles.dueBadgeText, { color: "#475569" }]}>
                  Deferred
                </Text>
              </View>
            ) : null}
            {meta.badgeLabel ? (
              <View
                style={[
                  styles.dueBadge,
                  {
                    backgroundColor: `${meta.badgeColor}1f`,
                    borderColor: meta.badgeColor,
                  },
                ]}
              >
                <Text style={[styles.dueBadgeText, { color: meta.badgeColor }]}>
                  {meta.badgeLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text
          style={[styles.topicName, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {topic.topicName}
        </Text>
        <Text style={[styles.topicMeta, { color: colors.mutedForeground }]}>
          {meta.sub}
          {topic.totalMinutesStudied > 0
            ? ` · ${topic.totalMinutesStudied}m`
            : ""}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

function SubjectAvatar({ subject }: { subject: string }) {
  function color(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 55%)`;
  }
  function bg(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return `hsla(${h}, 70%, 55%, 0.14)`;
  }
  function initials(str: string): string {
    return str
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2);
  }
  return (
    <View style={[styles.subjectAvatar, { backgroundColor: bg(subject) }]}>
      <Text style={[styles.subjectAvatarText, { color: color(subject) }]}>
        {initials(subject)}
      </Text>
    </View>
  );
}

function DoneRow({ topic, session }: { topic: Topic; session: StudySession }) {
  const colors = useColors();
  const subj = topic.subject;
  const mins = session.minutes ?? 0;
  const diff = session.difficulty ?? "medium";
  const diffLabel = diff === "easy" ? "Easy" : diff === "hard" ? "Hard" : "Moderate";
  return (
    <View
      style={[
        styles.topicCard,
        {
          backgroundColor: colors.card,
          borderColor: "#22c55e",
          borderWidth: 1,
          opacity: 0.72,
        },
      ]}
    >
      <SubjectAvatar subject={subj} />
      <View style={styles.topicTextWrap}>
        <View style={styles.topicTopRow}>
          <Text style={[styles.topicSubject, { color: colors.primary }]} numberOfLines={1}>
            {subj}
          </Text>
          <View style={styles.badgeStack}>
            <View
              style={[
                styles.dueBadge,
                { backgroundColor: "#22c55e1a", borderColor: "#22c55e" },
              ]}
            >
              <Text style={[styles.dueBadgeText, { color: "#22c55e" }]}>✓ Done</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.topicName, { color: colors.foreground }]} numberOfLines={2}>
          {topic.topicName}
        </Text>
        <Text style={[styles.topicMeta, { color: colors.mutedForeground }]}>
          {`${mins} min · ${diffLabel}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  fixedHeader: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: { gap: 14, paddingBottom: 6 },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  greetBlock: { gap: 2 },
  greetEyebrow: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  greetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: -0.5,
  },
  greetTagline: { fontFamily: "Inter_500Medium", fontSize: 14, opacity: 0.78 },
  topRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  chipExplainerWrap: {
    marginTop: 2,
  },
  chipExplainer: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
  chipExplainerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  ctaWrap: { borderRadius: 18, overflow: "hidden" },
  ctaGradient: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ctaGradientLocked: { minHeight: 68 },
  ctaIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  ctaTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  examBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  examBannerIcon: { fontSize: 22 },
  examBannerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: -0.2 as const },
  examBannerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  ctaSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  planCard: { padding: 14, borderRadius: 18, gap: 10 },
  planEyebrow: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 18 },
  planSub: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 4,
  },
  budgetBlock: { gap: 8 },
  budgetTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  budgetLabel: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  budgetValue: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  planCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  planCtaText: { color: "#0b1020", fontFamily: "Inter_700Bold", fontSize: 14 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 2,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot: { width: 9, height: 9, borderRadius: 999 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  sectionSubtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 3,
  },
  sectionCount: { fontFamily: "Inter_700Bold", fontSize: 12 },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  expandText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  vacationResumeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 4,
  },
  vacationResumeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  topicCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  topicTextWrap: { flex: 1, gap: 4 },
  topicTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  topicSubject: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    flex: 1,
  },
  badgeStack: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  dueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  dueBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.2,
  },
  topicName: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  topicMeta: { fontFamily: "Inter_500Medium", fontSize: 11, opacity: 0.7 },
  subjectAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  subjectAvatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.2,
  },
  progressWrap: { gap: 6, marginTop: 2 },
  progressBar: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
  },
  progressLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textAlign: "right",
  },
  allDoneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  allDoneTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: -0.2,
  },
  allDoneSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
});

const drawerStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 290,
    backgroundColor: "#080e1f",
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderRightColor: "rgba(34,211,238,0.12)",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  profileGoal: { color: "#22d3ee", fontFamily: "Inter_500Medium", fontSize: 12 },
  settingsBtn: { padding: 4 },
  statsRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statChipText: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 8,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  drawerItemText: {
    color: "#e2e8f0",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  drawerItemTextSmall: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  drawerItemDanger: { color: "#f87171" },
  upgradeWrap: { borderRadius: 14, overflow: "hidden", marginVertical: 4 },
  upgradeGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  upgradeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    flex: 1,
  },
  version: {
    color: "rgba(255,255,255,0.22)",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 10,
  },
});

const tooltipOverlayStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 100,
  },
  card: {
    backgroundColor: "rgba(15,15,25,0.95)",
    borderRadius: 20,
    padding: 28,
    gap: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.25)",
    maxWidth: 340,
    width: "100%",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 26,
  },
  hint: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
  },
});

const rankModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 24,
    paddingBottom: 44,
    gap: 6,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    textAlign: "center",
  },
  number: {
    fontFamily: "Inter_700Bold",
    fontSize: 42,
    textAlign: "center",
    letterSpacing: -1.5,
    marginTop: 2,
  },
  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    textAlign: "center",
    marginTop: 2,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  doneBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  doneText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
