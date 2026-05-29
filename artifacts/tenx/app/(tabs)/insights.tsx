import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Circle, G, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Topic, useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { formatHoursMinutes } from "@/lib/insights";
import { useSubscription } from "@/lib/revenuecat";

const DAY_MS = 24 * 60 * 60 * 1000;

const SUBJECT_PALETTE = [
  "#22d3ee",
  "#a78bfa",
  "#f59e0b",
  "#34d399",
  "#f87171",
  "#818cf8",
  "#fb923c",
  "#e879f9",
  "#60a5fa",
  "#4ade80",
];

const EASY_COLOR = "#22c55e";
const MEDIUM_COLOR = "#f59e0b";
const HARD_COLOR = "#ef4444";

// Donut geometry
const DONUT_R = 76;
const DONUT_STROKE = 22;
const DONUT_SIZE = 220;
const DONUT_CX = 110;
const DONUT_CY = 110;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_R;
const DONUT_GAP = 10;

function subjectColor(subject: string, allSubjects: string[]): string {
  const idx = allSubjects.indexOf(subject);
  return SUBJECT_PALETTE[(idx < 0 ? 0 : idx) % SUBJECT_PALETTE.length]!;
}

// ── Hardness analysis ───────────────────────────────────────────────────────

interface SubjectHardness {
  subject: string;
  color: string;
  easy: number;
  medium: number;
  hard: number;
  total: number;
}

function buildHardnessData(topics: Topic[]): SubjectHardness[] {
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));
  const map = new Map<string, { easy: number; medium: number; hard: number }>();

  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      const prev = map.get(topic.subject) ?? { easy: 0, medium: 0, hard: 0 };
      if (s.difficulty === "easy") prev.easy++;
      else if (s.difficulty === "medium") prev.medium++;
      else if (s.difficulty === "hard") prev.hard++;
      map.set(topic.subject, prev);
    }
  }

  return Array.from(map.entries())
    .map(([subject, counts]) => ({
      subject,
      color: subjectColor(subject, allSubjects),
      easy: counts.easy,
      medium: counts.medium,
      hard: counts.hard,
      total: counts.easy + counts.medium + counts.hard,
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ── Time investment ─────────────────────────────────────────────────────────

interface SubjectTimeInvestment {
  subject: string;
  color: string;
  minutes: number;
}

function buildTimeInvestment(
  topics: Topic[],
  days: 7 | 30,
): SubjectTimeInvestment[] {
  const cutoff = Date.now() - days * DAY_MS;
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));
  const map = new Map<string, number>();

  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      if (s.startedAt >= cutoff) {
        map.set(
          topic.subject,
          (map.get(topic.subject) ?? 0) + (s.minutes ?? 0),
        );
      }
    }
  }

  return Array.from(map.entries())
    .map(([subject, minutes]) => ({
      subject,
      color: subjectColor(subject, allSubjects),
      minutes,
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

// ── Smart insights ───────────────────────────────────────────────────────────

interface SmartInsight {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  type: "good" | "warn" | "info";
}

function buildSmartInsights(topics: Topic[]): SmartInsight[] {
  const insights: SmartInsight[] = [];
  if (topics.length === 0) return insights;

  const now = Date.now();
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));

  const subjectStats = new Map<
    string,
    {
      totalMin: number;
      sessions: number;
      easy: number;
      medium: number;
      hard: number;
      activeDays: Set<string>;
      lastStudied: number;
    }
  >();

  for (const subject of allSubjects) {
    subjectStats.set(subject, {
      totalMin: 0,
      sessions: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      activeDays: new Set(),
      lastStudied: 0,
    });
  }

  const hourBuckets = new Array(24).fill(0) as number[];
  const week1Cutoff = now - 7 * DAY_MS;
  const week2Cutoff = now - 14 * DAY_MS;
  let week1Sessions = 0;
  let week2Sessions = 0;

  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      const stat = subjectStats.get(topic.subject);
      if (!stat) continue;
      stat.totalMin += s.minutes ?? 0;
      stat.sessions += 1;
      if (s.difficulty === "easy") stat.easy++;
      else if (s.difficulty === "medium") stat.medium++;
      else if (s.difficulty === "hard") stat.hard++;
      const dayKey = new Date(s.startedAt).toDateString();
      stat.activeDays.add(dayKey);
      if (s.startedAt > stat.lastStudied) stat.lastStudied = s.startedAt;

      const h = new Date(s.startedAt).getHours();
      hourBuckets[h] = (hourBuckets[h] ?? 0) + 1;

      if (s.startedAt >= week1Cutoff) week1Sessions++;
      else if (s.startedAt >= week2Cutoff) week2Sessions++;
    }
  }

  let mostStudied = "";
  let mostStudiedMin = 0;
  for (const [subject, stat] of subjectStats) {
    if (stat.totalMin > mostStudiedMin) {
      mostStudiedMin = stat.totalMin;
      mostStudied = subject;
    }
  }
  if (mostStudied) {
    insights.push({
      icon: "star",
      label: "Most Studied",
      value: mostStudied,
      sub: formatHoursMinutes(mostStudiedMin) + " total",
      accent: "#a78bfa",
      type: "good",
    });
  }

  let hardestSubject = "";
  let hardestPct = 0;
  for (const [subject, stat] of subjectStats) {
    if (stat.sessions === 0) continue;
    const pct = stat.hard / stat.sessions;
    if (pct > hardestPct) {
      hardestPct = pct;
      hardestSubject = subject;
    }
  }
  if (hardestSubject && hardestPct > 0) {
    insights.push({
      icon: "zap",
      label: "Toughest Subject",
      value: hardestSubject,
      sub: `${Math.round(hardestPct * 100)}% Hard sessions`,
      accent: "#f87171",
      type: "warn",
    });
  }

  let consistentSubject = "";
  let maxActiveDays = 0;
  for (const [subject, stat] of subjectStats) {
    if (stat.activeDays.size > maxActiveDays) {
      maxActiveDays = stat.activeDays.size;
      consistentSubject = subject;
    }
  }
  if (consistentSubject && maxActiveDays > 1) {
    insights.push({
      icon: "trending-up",
      label: "Most Consistent",
      value: consistentSubject,
      sub: `${maxActiveDays} active days`,
      accent: "#22d3ee",
      type: "good",
    });
  }

  const staleSubjects: string[] = [];
  for (const [subject, stat] of subjectStats) {
    if (stat.sessions === 0) continue;
    const daysSince = Math.floor((now - stat.lastStudied) / DAY_MS);
    if (daysSince >= 7) staleSubjects.push(subject);
  }
  if (staleSubjects.length > 0) {
    insights.push({
      icon: "alert-triangle",
      label: "Needs Attention",
      value: staleSubjects.slice(0, 2).join(", "),
      sub: "Not studied in 7+ days",
      accent: "#f59e0b",
      type: "warn",
    });
  }

  if (week1Sessions + week2Sessions > 0) {
    if (week1Sessions > week2Sessions) {
      const uplift =
        week2Sessions === 0
          ? "↑ New streak"
          : `↑ ${Math.round(((week1Sessions - week2Sessions) / Math.max(1, week2Sessions)) * 100)}% vs last week`;
      insights.push({
        icon: "activity",
        label: "Momentum",
        value: "On the rise!",
        sub: uplift,
        accent: "#34d399",
        type: "good",
      });
    } else if (week1Sessions < week2Sessions && week2Sessions > 0) {
      insights.push({
        icon: "activity",
        label: "Momentum",
        value: "Slowing down",
        sub: `↓ ${Math.round(((week2Sessions - week1Sessions) / week2Sessions) * 100)}% vs last week`,
        accent: "#f59e0b",
        type: "warn",
      });
    }
  }

  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const totalSessionsAll = hourBuckets.reduce((a, b) => a + b, 0);
  if (totalSessionsAll > 0 && hourBuckets[peakHour]! > 0) {
    const suffix = peakHour < 12 ? "AM" : "PM";
    const h12 = peakHour === 0 ? 12 : peakHour > 12 ? peakHour - 12 : peakHour;
    insights.push({
      icon: "clock",
      label: "Peak Focus Hour",
      value: `${h12}:00 ${suffix}`,
      sub: `${hourBuckets[peakHour]} sessions at this hour`,
      accent: "#22d3ee",
      type: "info",
    });
  }

  const totalSessions = Array.from(subjectStats.values()).reduce(
    (a, s) => a + s.sessions,
    0,
  );
  const totalEasy = Array.from(subjectStats.values()).reduce(
    (a, s) => a + s.easy,
    0,
  );
  if (totalSessions >= 5) {
    const pct = Math.round((totalEasy / totalSessions) * 100);
    insights.push({
      icon: "award",
      label: "Mastery Rate",
      value: `${pct}% Easy`,
      sub: `${totalSessions} total sessions`,
      accent: pct >= 50 ? "#22c55e" : "#f59e0b",
      type: pct >= 50 ? "good" : "info",
    });
  }

  return insights;
}

// ── Hardness donut chart ─────────────────────────────────────────────────────

function HardnessDonut({
  totalEasy,
  totalMedium,
  totalHard,
  borderColor,
  mutedForeground,
}: {
  totalEasy: number;
  totalMedium: number;
  totalHard: number;
  borderColor: string;
  mutedForeground: string;
}) {
  const total = totalEasy + totalMedium + totalHard;

  const segments = [
    { label: "Easy", count: totalEasy, color: EASY_COLOR },
    { label: "Medium", count: totalMedium, color: MEDIUM_COLOR },
    { label: "Hard", count: totalHard, color: HARD_COLOR },
  ].filter((s) => s.count > 0);

  const gapCount = segments.length > 1 ? segments.length : 0;
  const availableArc = DONUT_CIRCUMFERENCE - DONUT_GAP * gapCount;

  let cumArc = 0;
  const arcs = segments.map((s) => {
    const arcLen = (s.count / total) * availableArc;
    const startArc = cumArc;
    cumArc += arcLen + (gapCount > 0 ? DONUT_GAP : 0);
    return { ...s, arcLen, startArc };
  });

  const easyPct = total > 0 ? Math.round((totalEasy / total) * 100) : 0;
  const medPct = total > 0 ? Math.round((totalMedium / total) * 100) : 0;
  const hardPct = total > 0 ? Math.round((totalHard / total) * 100) : 0;

  const dominant =
    totalEasy >= totalMedium && totalEasy >= totalHard
      ? { label: "Easy", pct: easyPct, color: EASY_COLOR }
      : totalMedium >= totalHard
        ? { label: "Medium", pct: medPct, color: MEDIUM_COLOR }
        : { label: "Hard", pct: hardPct, color: HARD_COLOR };

  return (
    <View style={donutStyles.wrap}>
      <View style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
        <Svg
          width={DONUT_SIZE}
          height={DONUT_SIZE}
          style={StyleSheet.absoluteFill}
        >
          <Circle
            cx={DONUT_CX}
            cy={DONUT_CY}
            r={DONUT_R}
            stroke={borderColor}
            strokeWidth={DONUT_STROKE}
            fill="none"
          />
          <G rotation="-90" origin={`${DONUT_CX},${DONUT_CY}`}>
            {arcs.map((arc) => (
              <Circle
                key={arc.label}
                cx={DONUT_CX}
                cy={DONUT_CY}
                r={DONUT_R}
                stroke={arc.color}
                strokeWidth={DONUT_STROKE}
                fill="none"
                strokeDasharray={`${arc.arcLen} ${DONUT_CIRCUMFERENCE * 2}`}
                strokeDashoffset={-arc.startArc}
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>

        <View style={donutStyles.center}>
          <Text style={[donutStyles.pctText, { color: dominant.color }]}>
            {dominant.pct}%
          </Text>
          <Text style={[donutStyles.dominantLabel, { color: dominant.color }]}>
            {dominant.label}
          </Text>
          <Text style={[donutStyles.dominantSub, { color: mutedForeground }]}>
            dominant
          </Text>
        </View>
      </View>

      {/* Percentage pills */}
      <View style={donutStyles.pillRow}>
        {[
          { label: "Easy", pct: easyPct, color: EASY_COLOR },
          { label: "Med", pct: medPct, color: MEDIUM_COLOR },
          { label: "Hard", pct: hardPct, color: HARD_COLOR },
        ].map((item) => (
          <View
            key={item.label}
            style={[
              donutStyles.pill,
              {
                backgroundColor: `${item.color}15`,
                borderColor: `${item.color}35`,
              },
            ]}
          >
            <View
              style={[donutStyles.pillDot, { backgroundColor: item.color }]}
            />
            <Text style={[donutStyles.pillText, { color: item.color }]}>
              {item.label} {item.pct}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12 },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pctText: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    letterSpacing: -1,
  },
  dominantLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginTop: 2,
  },
  dominantSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});

// ── Main screen ─────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topics, isLoading } = useTopics();
  const { isPro } = useSubscription();
  const [timePeriod, setTimePeriod] = useState<7 | 30>(7);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const hardnessData = useMemo(() => buildHardnessData(topics), [topics]);
  const timeData = useMemo(
    () => buildTimeInvestment(topics, timePeriod),
    [topics, timePeriod],
  );
  const smartInsights = useMemo(() => buildSmartInsights(topics), [topics]);

  const maxTimeMin = timeData.length > 0 ? timeData[0]!.minutes : 0;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const totalEasy = useMemo(
    () => hardnessData.reduce((s, h) => s + h.easy, 0),
    [hardnessData],
  );
  const totalMedium = useMemo(
    () => hardnessData.reduce((s, h) => s + h.medium, 0),
    [hardnessData],
  );
  const totalHard = useMemo(
    () => hardnessData.reduce((s, h) => s + h.hard, 0),
    [hardnessData],
  );

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Fixed header */}
      <View
        style={[
          styles.fixedHeader,
          {
            paddingTop: topInset + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.accent }]}>
          Subject Insights
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 36 }}
      >
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── SMART INSIGHTS ─────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={styles.analyticsSection}>
          <View style={styles.analyticsTitleRow}>
            <View
              style={[
                styles.analyticsTitleIcon,
                { backgroundColor: "#a78bfa22" },
              ]}
            >
              <Feather name="cpu" size={14} color="#a78bfa" />
            </View>
            <Text style={styles.analyticsSectionTitle}>Smart Insights</Text>
          </View>
          <Text style={styles.analyticsSectionSub}>
            Auto-generated from your study history
          </Text>

          {!isPro ? (
            <ProChartOverlay onPress={() => router.push("/paywall")} />
          ) : null}

          {smartInsights.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather
                name="book-open"
                size={28}
                color={colors.mutedForeground}
              />
              <Text style={styles.emptyCardText}>
                Study a few sessions to unlock insights
              </Text>
            </View>
          ) : (
            <View style={styles.insightGrid}>
              {smartInsights.map((ins, i) => (
                <View
                  key={i}
                  style={[
                    styles.insightCard,
                    { borderColor: `${ins.accent}30` },
                  ]}
                >
                  <View
                    style={[
                      styles.insightIconWrap,
                      { backgroundColor: `${ins.accent}18` },
                    ]}
                  >
                    <Feather name={ins.icon} size={16} color={ins.accent} />
                  </View>
                  <Text style={styles.insightLabel}>{ins.label}</Text>
                  <Text
                    style={[styles.insightValue, { color: ins.accent }]}
                    numberOfLines={1}
                  >
                    {ins.value}
                  </Text>
                  {ins.sub ? (
                    <Text style={styles.insightSub} numberOfLines={2}>
                      {ins.sub}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── SUBJECT HARDNESS ───────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={styles.thickDivider} />

        <View style={styles.analyticsSection}>
          <View style={styles.analyticsTitleRow}>
            <View
              style={[
                styles.analyticsTitleIcon,
                { backgroundColor: "#ef444422" },
              ]}
            >
              <Feather name="layers" size={14} color="#f87171" />
            </View>
            <Text style={styles.analyticsSectionTitle}>Subject Hardness</Text>
          </View>
          <Text style={styles.analyticsSectionSub}>
            Overall difficulty distribution across all subjects
          </Text>

          {!isPro ? (
            <ProChartOverlay onPress={() => router.push("/paywall")} />
          ) : null}

          {hardnessData.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather
                name="bar-chart-2"
                size={28}
                color={colors.mutedForeground}
              />
              <Text style={styles.emptyCardText}>No sessions rated yet</Text>
            </View>
          ) : (
            <>
              {/* Overall donut */}
              <HardnessDonut
                totalEasy={totalEasy}
                totalMedium={totalMedium}
                totalHard={totalHard}
                borderColor={colors.border}
                mutedForeground={colors.mutedForeground}
              />

              {/* Per-subject breakdown */}
              <View style={styles.subBreakdownHeader}>
                <Feather
                  name="list"
                  size={13}
                  color={colors.mutedForeground}
                />
                <Text style={styles.subBreakdownLabel}>
                  Per-subject breakdown
                </Text>
              </View>

              <View style={styles.hardnessList}>
                {hardnessData.map((s) => {
                  const hardnessPct =
                    s.total > 0
                      ? Math.round(
                          ((s.medium * 1 + s.hard * 2) / (s.total * 2)) * 100,
                        )
                      : 0;

                  return (
                    <View key={s.subject} style={styles.hardnessCard}>
                      <View style={styles.hardnessCardHeader}>
                        <View style={styles.hardnessLabelWrap}>
                          <View
                            style={[
                              styles.subjectDot,
                              { backgroundColor: s.color },
                            ]}
                          />
                          <Text
                            style={styles.hardnessSubjectName}
                            numberOfLines={1}
                          >
                            {s.subject}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.hardnessPctBadge,
                            { backgroundColor: `${HARD_COLOR}18` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.hardnessPctText,
                              { color: HARD_COLOR },
                            ]}
                          >
                            {hardnessPct}% Hard
                          </Text>
                        </View>
                      </View>

                      <View style={styles.hardnessRows}>
                        {[
                          { label: "Easy", count: s.easy, color: EASY_COLOR },
                          {
                            label: "Medium",
                            count: s.medium,
                            color: MEDIUM_COLOR,
                          },
                          { label: "Hard", count: s.hard, color: HARD_COLOR },
                        ].map((row) => {
                          const barPct =
                            s.total > 0 ? (row.count / s.total) * 100 : 0;
                          return (
                            <View key={row.label} style={styles.hardnessMiniRow}>
                              <Text
                                style={[
                                  styles.hardnessMiniLabel,
                                  { color: row.color },
                                ]}
                              >
                                {row.label}
                              </Text>
                              <View
                                style={[
                                  styles.hardnessMiniTrack,
                                  { backgroundColor: colors.muted },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.hardnessMiniFill,
                                    {
                                      width: `${barPct}%`,
                                      backgroundColor: row.color,
                                    },
                                  ]}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.hardnessMiniCount,
                                  { color: colors.foreground },
                                ]}
                              >
                                {row.count}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TIME INVESTMENT ────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={styles.thickDivider} />

        <View style={styles.analyticsSection}>
          <View style={styles.analyticsTitleRow}>
            <View
              style={[
                styles.analyticsTitleIcon,
                { backgroundColor: "#22d3ee22" },
              ]}
            >
              <Feather name="clock" size={14} color="#22d3ee" />
            </View>
            <Text style={styles.analyticsSectionTitle}>Time Investment</Text>
          </View>
          <Text style={styles.analyticsSectionSub}>
            Study hours per subject — tap to switch period
          </Text>

          {!isPro ? (
            <ProChartOverlay onPress={() => router.push("/paywall")} />
          ) : null}

          {/* Period toggle */}
          <View style={styles.periodToggle}>
            <Pressable
              onPress={() => setTimePeriod(7)}
              style={[
                styles.periodBtn,
                timePeriod === 7 && styles.periodBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.periodBtnText,
                  timePeriod === 7 && styles.periodBtnTextActive,
                ]}
              >
                Last 7 days
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTimePeriod(30)}
              style={[
                styles.periodBtn,
                timePeriod === 30 && styles.periodBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.periodBtnText,
                  timePeriod === 30 && styles.periodBtnTextActive,
                ]}
              >
                Last 30 days
              </Text>
            </Pressable>
          </View>

          {timeData.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="clock" size={28} color={colors.mutedForeground} />
              <Text style={styles.emptyCardText}>
                No sessions in the last {timePeriod} days
              </Text>
            </View>
          ) : (
            <View style={styles.timeList}>
              {timeData.map((s, i) => {
                const ratio = maxTimeMin > 0 ? s.minutes / maxTimeMin : 0;
                const rankEmoji =
                  i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

                return (
                  <View key={s.subject} style={styles.timeRow}>
                    <View style={styles.timeRowTop}>
                      <View style={styles.timeSubjectLeft}>
                        {rankEmoji ? (
                          <Text style={styles.rankEmoji}>{rankEmoji}</Text>
                        ) : (
                          <View
                            style={[
                              styles.subjectDot,
                              { backgroundColor: s.color },
                            ]}
                          />
                        )}
                        <Text
                          style={styles.timeSubjectName}
                          numberOfLines={1}
                        >
                          {s.subject}
                        </Text>
                      </View>
                      <Text style={[styles.timeValue, { color: s.color }]}>
                        {formatHoursMinutes(s.minutes)}
                      </Text>
                    </View>

                    <View style={styles.timeBarTrack}>
                      <View
                        style={[
                          styles.timeBarFill,
                          {
                            width: `${Math.max(4, ratio * 100)}%`,
                            backgroundColor: s.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.thickDivider} />
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    centered: { alignItems: "center", justifyContent: "center" },

    fixedHeader: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 22,
      letterSpacing: -0.5,
    },

    thickDivider: {
      height: 10,
      backgroundColor: c.muted,
      marginTop: 4,
    },

    analyticsSection: {
      position: "relative",
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 8,
      gap: 14,
    },
    analyticsTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    analyticsTitleIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    analyticsSectionTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: c.foreground,
      letterSpacing: -0.3,
    },
    analyticsSectionSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: c.mutedForeground,
      lineHeight: 18,
      marginTop: -8,
    },
    emptyCard: {
      alignItems: "center",
      gap: 12,
      paddingVertical: 36,
      borderRadius: 16,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyCardText: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      color: c.mutedForeground,
      textAlign: "center",
    },

    /* Smart Insights grid */
    insightGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    insightCard: {
      width: "47.5%",
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      gap: 6,
    },
    insightIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2,
    },
    insightLabel: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      color: c.mutedForeground,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    insightValue: {
      fontFamily: "Inter_700Bold",
      fontSize: 15,
      letterSpacing: -0.3,
    },
    insightSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: c.mutedForeground,
      lineHeight: 15,
    },

    /* Per-subject breakdown header */
    subBreakdownHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    subBreakdownLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: c.mutedForeground,
      letterSpacing: 0.2,
    },

    /* Hardness per-subject */
    hardnessList: { gap: 14 },
    hardnessCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 10,
    },
    hardnessCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    hardnessLabelWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    subjectDot: { width: 8, height: 8, borderRadius: 4 },
    hardnessSubjectName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: c.foreground,
      flex: 1,
    },
    hardnessPctBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    hardnessPctText: { fontFamily: "Inter_700Bold", fontSize: 12 },
    hardnessRows: { gap: 8 },
    hardnessMiniRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    hardnessMiniLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 11,
      width: 44,
    },
    hardnessMiniTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    hardnessMiniFill: { height: "100%", borderRadius: 3 },
    hardnessMiniCount: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      minWidth: 20,
      textAlign: "right",
    },

    /* Time investment */
    periodToggle: { flexDirection: "row", gap: 8, marginTop: -4 },
    periodBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
    },
    periodBtnActive: {
      backgroundColor: `${c.primary}20`,
      borderColor: `${c.primary}50`,
    },
    periodBtnText: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      color: c.mutedForeground,
    },
    periodBtnTextActive: {
      fontFamily: "Inter_700Bold",
      color: c.primary,
    },
    timeList: { gap: 16 },
    timeRow: { gap: 7 },
    timeRowTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    timeSubjectLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    rankEmoji: { fontSize: 16 },
    timeSubjectName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: c.foreground,
      flex: 1,
    },
    timeValue: {
      fontFamily: "Inter_700Bold",
      fontSize: 14,
      letterSpacing: -0.3,
    },
    timeBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.muted,
      overflow: "hidden",
    },
    timeBarFill: { height: "100%", borderRadius: 4, opacity: 0.85 },
  });
}

function ProChartOverlay({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[StyleSheet.absoluteFillObject, proOverlayStyles.overlay]}
    >
      <View style={proOverlayStyles.content}>
        <Feather name="lock" size={18} color="#fff" />
        <Text style={proOverlayStyles.title}>Pro Feature</Text>
        <Text style={proOverlayStyles.sub}>
          Upgrade to unlock detailed analytics
        </Text>
        <View style={proOverlayStyles.btn}>
          <Text style={proOverlayStyles.btnText}>Upgrade to Pro</Text>
        </View>
      </View>
    </Pressable>
  );
}

const proOverlayStyles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(11,16,32,0.72)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    left: 16,
    right: 16,
    top: 72,
    bottom: 8,
  },
  content: { alignItems: "center", gap: 6, paddingHorizontal: 24 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  btn: {
    marginTop: 6,
    backgroundColor: "#4f46e5",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  btnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#fff",
  },
});
