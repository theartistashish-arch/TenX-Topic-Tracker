import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useExamMode } from "@/contexts/ExamModeContext";
import {
  Difficulty,
  SRSchedule,
  computeSR,
  daysOverdueOf,
  useTopics,
} from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { useAds } from "@/lib/ads";
import {
  cancelTodayStreakAlert,
  checkAndScheduleMilestoneNotification,
  scheduleTopicRevisionNotification,
} from "@/lib/notifications";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

export default function ReceiptScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showInterstitialIfDue } = useAds();
  const params = useLocalSearchParams<{
    topicId: string;
    minutes: string;
    pauses?: string;
  }>();
  const { topics, getTopic, recordSession } = useTopics();
  const { examModeActive, examSubjects, examDate } = useExamMode();

  const topicId = params.topicId;
  const minutes = useMemo(() => {
    const n = Number(params.minutes ?? "0");
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }, [params.minutes]);
  const pauseCount = useMemo(() => {
    const n = Number(params.pauses ?? "0");
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }, [params.pauses]);

  const topic = topicId ? getTopic(topicId) : null;

  // Snapshot overdue state and SR fields at mount — must not re-derive after
  // recordSession mutates the topic in the context.
  const initialOverdueDays = useMemo(
    () => (topic ? daysOverdueOf(topic) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topicId],
  );
  const initialPrevReviewAt = useMemo(
    () => (topic ? topic.nextReviewAt : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topicId],
  );
  // Snapshot the SR state so previews don't jump after recording.
  const initialSRState = useMemo(
    () => ({
      interval: topic?.srInterval ?? 1,
      easeFactor: topic?.srEaseFactor ?? 2.5,
      repetitionCount: topic?.srRepetitionCount ?? 0,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topicId],
  );

  const [selected, setSelected] = useState<Difficulty | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  if (!topic) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
          Session not found.
        </Text>
        <Pressable onPress={() => router.replace("/home")} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
            Back to Home
          </Text>
        </Pressable>
      </View>
    );
  }

  // Exam Mode priority cap: if starred topic in active exam subject before exam date,
  // rating buttons are locked and every review is capped to 1 day.
  const examCapActive =
    examModeActive &&
    !!topic.isImportant &&
    examSubjects.includes(topic.subject) &&
    examDate !== null &&
    Date.now() < examDate;

  const ratingLocked = examCapActive;

  // Pre-compute the SM-2 result for each difficulty option so we can show
  // dynamic "+X days" labels before the user taps — this matches exactly what
  // recordSession will persist.
  const previews = useMemo<Record<Difficulty, SRSchedule>>(() => {
    const opts: Difficulty[] = ["easy", "medium", "hard"];
    return opts.reduce(
      (acc, d) => {
        acc[d] = computeSR(d, initialSRState, initialPrevReviewAt, Date.now());
        return acc;
      },
      {} as Record<Difficulty, SRSchedule>,
    );
  }, [initialSRState, initialPrevReviewAt]);

  const handleRate = async (d: Difficulty) => {
    if (saving) return;
    setSelected(d);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    setSaving(true);
    await recordSession({
      topicId: topic.id,
      minutes,
      difficulty: d,
      pauseCount,
      examContext: { active: examModeActive, subjects: examSubjects, date: examDate },
    });

    if (Platform.OS !== "web") {
      // Schedule per-topic revision reminder for its next due date
      const preview = previews[d];
      const daysUntilReview = examCapActive
        ? Math.min(preview.effectiveDays, 1)
        : preview.effectiveDays;
      const nextReviewAt = Date.now() + daysUntilReview * DAY_MS;
      void scheduleTopicRevisionNotification(
        topic.id, topic.topicName, topic.subject, nextReviewAt,
      );

      // Cancel today's streak guards since the user has now studied
      void cancelTodayStreakAlert();

      // Check if this session hits a milestone (10 / 25 / 50 / 100)
      const totalSessions =
        topics.reduce((sum, t) => sum + (t.sessions?.length ?? 0), 0) + 1;
      void checkAndScheduleMilestoneNotification(totalSessions);
    }

    await showInterstitialIfDue();
    setSaving(false);
    router.replace("/home");
  };

  const handleDone = () => router.replace("/home");

  // Build the schedule preview for the receipt row — use the pre-computed SR
  // result, then apply the exam cap if needed.
  const rawSchedule = selected ? previews[selected] : null;
  const schedulePreview = rawSchedule
    ? {
        ...rawSchedule,
        effectiveDays: examCapActive
          ? Math.min(rawSchedule.effectiveDays, 1)
          : rawSchedule.effectiveDays,
        examCapApplied: examCapActive && rawSchedule.effectiveDays > 1,
      }
    : null;

  const nextReviewTs = schedulePreview
    ? Date.now() + schedulePreview.effectiveDays * DAY_MS
    : null;

  return (
    <LinearGradient
      colors={["#0b1020", "#062b34", "#0b1020"]}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 24, paddingBottom: bottomInset + 24 },
        ]}
      >
        {/* ── RATING SECTION ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How did it feel?</Text>
          <Text style={styles.sectionSubtitle}>
            {ratingLocked
              ? "Rating locked — Exam Mode is active for this topic."
              : "Your answer sets when we remind you to revise this."}
          </Text>

          <View style={styles.ratingStack}>
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
              const tint = DIFF_TINT[d];
              const preview = previews[d];
              const isActive = selected === d;
              const intervalLabel = examCapActive ? "Revise tomorrow" : `Revise in ${preview.newInterval} ${preview.newInterval === 1 ? "day" : "days"}`;

              return (
                <Pressable
                  key={d}
                  onPress={ratingLocked ? undefined : () => handleRate(d)}
                  disabled={saving || ratingLocked}
                  style={({ pressed }) => [
                    styles.ratingBtn,
                    {
                      backgroundColor: isActive ? tint : `${tint}18`,
                      borderColor: isActive ? tint : `${tint}40`,
                      opacity: ratingLocked ? 0.45 : pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <View style={styles.ratingBtnLeft}>
                    <Text style={styles.ratingLabel}>{DIFF_LABEL[d]}</Text>
                    <Text style={[styles.ratingGuide, { color: isActive ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.55)" }]}>
                      {DIFF_GUIDE[d]}
                    </Text>
                  </View>
                  <Text
                    style={[styles.ratingDays, { color: isActive ? "#fff" : tint }]}
                    numberOfLines={1}
                  >
                    {intervalLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {ratingLocked ? (
            <View style={styles.lockedBox}>
              <Feather name="zap" size={14} color="#f97316" />
              <Text style={styles.lockedHint}>
                Priority topic in Exam Mode — review auto-scheduled for tomorrow.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 22,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  ratingStack: {
    flexDirection: "column",
    gap: 10,
    marginTop: 6,
  },
  ratingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 2,
    gap: 14,
  },
  ratingLabel: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  ratingGuide: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  ratingDays: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 0.2,
    flexShrink: 1,
    textAlign: "right",
  },
  ratingBtnLeft: {
    flex: 1,
    gap: 4,
  },
  lockedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(249,115,22,0.08)",
    borderColor: "rgba(249,115,22,0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  lockedHint: {
    color: "#f97316",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});

