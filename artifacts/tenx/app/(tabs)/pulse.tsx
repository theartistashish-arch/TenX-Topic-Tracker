import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Circle, G, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Difficulty, Topic, isDueToday, useTopics } from "@/contexts/TopicsContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { formatHoursMinutes } from "@/lib/insights";

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

// Smaller ring for the side-by-side stat card layout
const RING_R = 65;
const RING_STROKE = 10;
const RING_SIZE = 170;
const RING_CX = 85;
const RING_CY = 85;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const GAP_ARC = 8;

// Heatmap sizing — 10 cells per row, computed from screen width
const HEAT_PER_ROW = 10;
const HEAT_GAP = 4;

// Goal bar chart fixed height
const CHART_H = 80;

const DAY_2 = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function subjectColor(subject: string, allSubjects: string[]): string {
  const idx = allSubjects.indexOf(subject);
  return SUBJECT_PALETTE[(idx < 0 ? 0 : idx) % SUBJECT_PALETTE.length]!;
}

// ── Today ring data ──────────────────────────────────────────────────────────

interface TodaySubjectStat {
  subject: string;
  color: string;
  todayMin: number;
}

interface TodayTopicEntry {
  topicId: string;
  topicName: string;
  subject: string;
}

function buildTodayData(topics: Topic[]): {
  subjects: TodaySubjectStat[];
  topicsRead: TodayTopicEntry[];
  totalMin: number;
} {
  const todayStart = startOfDay(Date.now());
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));
  const subjectMap = new Map<string, number>();
  const topicsReadSet = new Set<string>();
  const topicsRead: TodayTopicEntry[] = [];

  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      if (startOfDay(s.startedAt) === todayStart) {
        subjectMap.set(
          topic.subject,
          (subjectMap.get(topic.subject) ?? 0) + (s.minutes ?? 0),
        );
        if (!topicsReadSet.has(topic.id)) {
          topicsReadSet.add(topic.id);
          topicsRead.push({
            topicId: topic.id,
            topicName: topic.topicName,
            subject: topic.subject,
          });
        }
      }
    }
  }

  const subjects: TodaySubjectStat[] = Array.from(subjectMap.entries())
    .map(([subject, todayMin]) => ({
      subject,
      color: subjectColor(subject, allSubjects),
      todayMin,
    }))
    .filter((s) => s.todayMin > 0)
    .sort((a, b) => b.todayMin - a.todayMin);

  const totalMin = subjects.reduce((s, x) => s + x.todayMin, 0);
  return { subjects, topicsRead, totalMin };
}

interface RingSegment {
  subject: string;
  color: string;
  arcLen: number;
  startArc: number;
}

function computeSegments(subjects: TodaySubjectStat[]): RingSegment[] {
  const totalMin = subjects.reduce((s, x) => s + x.todayMin, 0);
  if (totalMin === 0 || subjects.length === 0) return [];
  const gapCount = subjects.length > 1 ? subjects.length : 0;
  const availableArc = CIRCUMFERENCE - GAP_ARC * gapCount;
  let cumArc = 0;
  return subjects.map((s) => {
    const arcLen = (s.todayMin / totalMin) * availableArc;
    const startArc = cumArc;
    cumArc += arcLen + (gapCount > 0 ? GAP_ARC : 0);
    return { subject: s.subject, color: s.color, arcLen, startArc };
  });
}

// ── Streak ───────────────────────────────────────────────────────────────────

function buildStreak(topics: Topic[]): number {
  const todayStart = startOfDay(Date.now());
  const studiedDays = new Set<number>();
  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      studiedDays.add(startOfDay(s.startedAt));
    }
  }
  let streak = 0;
  // Allow streak to start from yesterday if today has no sessions yet
  let day = studiedDays.has(todayStart) ? todayStart : todayStart - DAY_MS;
  while (studiedDays.has(day)) {
    streak++;
    day -= DAY_MS;
  }
  return streak;
}

// ── 30-day heatmap ───────────────────────────────────────────────────────────

interface HeatCell {
  dayStart: number;
  minutes: number;
  sessions: number;
}

function buildHeatmap(topics: Topic[]): HeatCell[] {
  const todayStart = startOfDay(Date.now());
  const cells: HeatCell[] = [];
  for (let i = 29; i >= 0; i--) {
    cells.push({ dayStart: todayStart - i * DAY_MS, minutes: 0, sessions: 0 });
  }
  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      const d = startOfDay(s.startedAt);
      const idx = cells.findIndex((c) => c.dayStart === d);
      if (idx >= 0) {
        cells[idx]!.minutes += s.minutes ?? 0;
        cells[idx]!.sessions += 1;
      }
    }
  }
  return cells;
}

// ── Today's detailed sessions ────────────────────────────────────────────────

interface TodaySession {
  sessionId: string;
  topicId: string;
  topicName: string;
  subject: string;
  color: string;
  minutes: number;
  difficulty: Difficulty;
}

function buildTodaySessions(topics: Topic[]): TodaySession[] {
  const todayStart = startOfDay(Date.now());
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));
  const result: TodaySession[] = [];
  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      if (startOfDay(s.startedAt) === todayStart) {
        result.push({
          sessionId: s.id,
          topicId: topic.id,
          topicName: topic.topicName,
          subject: topic.subject,
          color: subjectColor(topic.subject, allSubjects),
          minutes: s.minutes ?? 0,
          difficulty: s.difficulty,
        });
      }
    }
  }
  return result;
}

// ── 7-day goal chart ─────────────────────────────────────────────────────────

interface GoalDay {
  dayStart: number;
  label: string;
  minutes: number;
  isToday: boolean;
}

function buildGoalChart(topics: Topic[]): GoalDay[] {
  const todayStart = startOfDay(Date.now());
  const dayStarts: number[] = [];
  const days: GoalDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const ds = todayStart - i * DAY_MS;
    dayStarts.push(ds);
    days.push({
      dayStart: ds,
      label: DAY_2[new Date(ds).getDay()]!,
      minutes: 0,
      isToday: i === 0,
    });
  }
  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      const d = startOfDay(s.startedAt);
      const idx = dayStarts.indexOf(d);
      if (idx >= 0) days[idx]!.minutes += s.minutes ?? 0;
    }
  }
  return days;
}

// ── StatCard sub-component ───────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  color,
  icon,
  colors,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
  icon: keyof typeof Feather.glyphMap;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        statCardStyles.wrap,
        { backgroundColor: colors.card, borderColor: `${color}22` },
      ]}
    >
      <View style={[statCardStyles.leftBar, { backgroundColor: color }]} />
      <View style={statCardStyles.body}>
        <View style={statCardStyles.labelRow}>
          <Feather name={icon} size={10} color={color} />
          <Text
            style={[statCardStyles.label, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
        <Text
          style={[statCardStyles.value, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={[statCardStyles.unit, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const statCardStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    minHeight: 72,
  },
  leftBar: { width: 3 },
  body: { flex: 1, padding: 9, gap: 2, justifyContent: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.3 },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: -0.5,
    lineHeight: 22,
  },
  unit: { fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function PulseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topics, isLoading } = useTopics();
  const { settings } = useSettings();
  const { width: windowWidth } = useWindowDimensions();
  const heatCellSize = Math.floor(
    (windowWidth - 40 - (HEAT_PER_ROW - 1) * HEAT_GAP) / HEAT_PER_ROW,
  );

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const { subjects, topicsRead, totalMin } = useMemo(
    () => buildTodayData(topics),
    [topics],
  );
  const segments = useMemo(() => computeSegments(subjects), [subjects]);
  const streak = useMemo(() => buildStreak(topics), [topics]);
  const heatmapData = useMemo(() => buildHeatmap(topics), [topics]);
  const todaySessions = useMemo(() => buildTodaySessions(topics), [topics]);
  const goalChartData = useMemo(() => buildGoalChart(topics), [topics]);
  const dueCount = useMemo(
    () => topics.filter((t) => isDueToday(t)).length,
    [topics],
  );

  const dailyGoalMin = settings.dailyBudgetMin;

  const maxGoalMin = useMemo(
    () => Math.max(dailyGoalMin, ...goalChartData.map((d) => d.minutes), 1),
    [dailyGoalMin, goalChartData],
  );
  const goalLineY = useMemo(
    () => CHART_H - Math.round((dailyGoalMin / maxGoalMin) * CHART_H),
    [dailyGoalMin, maxGoalMin],
  );

  const styles = useMemo(() => makeStyles(colors), [colors]);

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
          Your study signal
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 36 }}
      >
        {/* Section title */}
        <View style={styles.sectionTitleRow}>
          <Feather name="bar-chart-2" size={20} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Study Pulse
          </Text>
        </View>

        {/* ── Ring + 4 stat cards ── */}
        <View style={styles.ringRow}>
          {/* Left: Streak + Goal */}
          <View style={styles.statCardCol}>
            <StatCard
              label="Streak"
              value={streak === 0 ? "–" : `${streak}`}
              unit={streak === 0 ? "no streak" : streak === 1 ? "day" : "days"}
              color="#f97316"
              icon="zap"
              colors={colors}
            />
            <StatCard
              label="Today's Goal"
              value={`${totalMin}`}
              unit={`/ ${dailyGoalMin} min`}
              color="#22c55e"
              icon="target"
              colors={colors}
            />
          </View>

          {/* Ring */}
          <Pressable onPress={() => router.push("/study-activity")}>
            <View style={styles.ringWrapper}>
              <Svg
                width={RING_SIZE}
                height={RING_SIZE}
                style={StyleSheet.absoluteFill}
              >
                <Circle
                  cx={RING_CX}
                  cy={RING_CY}
                  r={RING_R}
                  stroke={colors.border}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                <G rotation="-90" origin={`${RING_CX},${RING_CY}`}>
                  {segments.map((seg) => (
                    <Circle
                      key={seg.subject}
                      cx={RING_CX}
                      cy={RING_CY}
                      r={RING_R}
                      stroke={seg.color}
                      strokeWidth={RING_STROKE}
                      fill="none"
                      strokeDasharray={`${seg.arcLen} ${CIRCUMFERENCE * 2}`}
                      strokeDashoffset={-seg.startArc}
                      strokeLinecap="butt"
                    />
                  ))}
                </G>
              </Svg>
              <View style={styles.ringCenter} pointerEvents="none">
                <Text style={styles.ringEyebrow}>TODAY</Text>
                <Text style={styles.ringTime}>
                  {totalMin === 0 ? "0m" : formatHoursMinutes(totalMin)}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Right: Studied + Due */}
          <View style={styles.statCardCol}>
            <StatCard
              label="Studied"
              value={`${topicsRead.length}`}
              unit={topicsRead.length === 1 ? "topic" : "topics"}
              color="#22d3ee"
              icon="book-open"
              colors={colors}
            />
            <StatCard
              label="Due Today"
              value={`${dueCount}`}
              unit={dueCount === 1 ? "topic" : "topics"}
              color="#ef4444"
              icon="clock"
              colors={colors}
            />
          </View>
        </View>

        {/* Study activity link */}
        <Pressable
          onPress={() => router.push("/study-activity")}
          style={({ pressed }) => [
            styles.detailsBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={styles.detailsBtnText}>View Study activity details</Text>
          <Feather name="arrow-right" size={14} color={colors.accent} />
        </Pressable>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── STREAK HISTORY ─────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={styles.thickDivider} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View
              style={[styles.sectionIconBg, { backgroundColor: "#f9731622" }]}
            >
              <Feather name="calendar" size={14} color="#f97316" />
            </View>
            <Text style={styles.sectionHeading}>Streak History</Text>
          </View>
          <Text style={styles.sectionSub}>30-day study activity</Text>

          <View style={styles.heatmapGrid}>
            {heatmapData.map((cell, i) => {
              const n = cell.sessions;
              const bg =
                n === 0
                  ? colors.muted
                  : n <= 2
                    ? "#22c55e55"
                    : n <= 5
                      ? "#22c55ea0"
                      : "#22c55e";
              const isToday = i === heatmapData.length - 1;
              return (
                <View
                  key={i}
                  style={[
                    styles.heatCell,
                    { backgroundColor: bg, width: heatCellSize, height: heatCellSize },
                    isToday && styles.heatCellToday,
                  ]}
                />
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.heatLegend}>
            <Text style={styles.heatLegendText}>Less</Text>
            {(
              [colors.muted, "#22c55e55", "#22c55ea0", "#22c55e"] as string[]
            ).map((bg, i) => (
              <View
                key={i}
                style={[styles.heatLegendCell, { backgroundColor: bg }]}
              />
            ))}
            <Text style={styles.heatLegendText}>More</Text>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── STUDIED TODAY ──────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={styles.thickDivider} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View
              style={[styles.sectionIconBg, { backgroundColor: "#22d3ee22" }]}
            >
              <Feather name="check-square" size={14} color="#22d3ee" />
            </View>
            <Text style={styles.sectionHeading}>Studied Today</Text>
          </View>
          <Text style={styles.sectionSub}>
            {todaySessions.length === 0
              ? "No sessions yet today"
              : `${todaySessions.length} session${todaySessions.length !== 1 ? "s" : ""} completed`}
          </Text>

          {todaySessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather
                name="book-open"
                size={28}
                color={colors.mutedForeground}
              />
              <Text style={styles.emptyCardText}>
                Start a focus session to see it here
              </Text>
            </View>
          ) : (
            <View style={styles.sessionsList}>
              {todaySessions.map((s) => {
                const diffColor =
                  s.difficulty === "easy"
                    ? EASY_COLOR
                    : s.difficulty === "medium"
                      ? MEDIUM_COLOR
                      : HARD_COLOR;
                const diffLabel =
                  s.difficulty.charAt(0).toUpperCase() +
                  s.difficulty.slice(1);
                return (
                  <View key={s.sessionId} style={styles.sessionRow}>
                    <View
                      style={[
                        styles.sessionDot,
                        { backgroundColor: s.color },
                      ]}
                    />
                    <View style={styles.sessionInfo}>
                      <Text
                        style={styles.sessionTopicName}
                        numberOfLines={1}
                      >
                        {s.topicName}
                      </Text>
                      <Text
                        style={[
                          styles.sessionSubject,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                      >
                        {s.subject}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.sessionDuration,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {s.minutes > 0 ? formatHoursMinutes(s.minutes) : "<1m"}
                    </Text>
                    <View
                      style={[
                        styles.diffBadge,
                        {
                          backgroundColor: `${diffColor}18`,
                          borderColor: `${diffColor}40`,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.diffBadgeText, { color: diffColor }]}
                      >
                        {diffLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── GOAL COMPLETION ────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <View style={styles.thickDivider} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View
              style={[styles.sectionIconBg, { backgroundColor: "#22c55e22" }]}
            >
              <Feather name="bar-chart-2" size={14} color="#22c55e" />
            </View>
            <Text style={styles.sectionHeading}>Goal Completion</Text>
          </View>
          <Text style={styles.sectionSub}>
            Daily target: {formatHoursMinutes(dailyGoalMin)} — last 7 days
          </Text>

          {/* Bar chart */}
          <View
            style={[
              styles.chartArea,
              { height: CHART_H },
            ]}
          >
            {/* Goal dashed line */}
            <View style={[styles.goalLine, { top: goalLineY }]} />
            {/* Bars */}
            {goalChartData.map((day, i) => {
              const frac =
                maxGoalMin > 0
                  ? Math.min(1, day.minutes / maxGoalMin)
                  : 0;
              const barH = Math.max(frac > 0 ? 4 : 2, Math.round(frac * CHART_H));
              const meetsGoal =
                dailyGoalMin > 0 && day.minutes >= dailyGoalMin;
              const barColor = meetsGoal
                ? "#22c55e"
                : day.isToday
                  ? colors.primary
                  : `${colors.primary}50`;
              return (
                <View
                  key={i}
                  style={[
                    styles.chartBar,
                    { height: barH, backgroundColor: barColor },
                  ]}
                />
              );
            })}
          </View>

          {/* Day labels */}
          <View style={styles.chartLabels}>
            {goalChartData.map((day, i) => (
              <Text
                key={i}
                style={[
                  styles.chartLabel,
                  {
                    color: day.isToday
                      ? colors.primary
                      : colors.mutedForeground,
                    fontFamily: day.isToday
                      ? "Inter_700Bold"
                      : "Inter_400Regular",
                  },
                ]}
              >
                {day.label}
              </Text>
            ))}
          </View>

          {/* Goal line legend */}
          <View style={styles.goalLegend}>
            <View
              style={[
                styles.goalLegendLine,
                { borderColor: "#22c55e80" },
              ]}
            />
            <Text
              style={[
                styles.goalLegendText,
                { color: colors.mutedForeground },
              ]}
            >
              Goal ({formatHoursMinutes(dailyGoalMin)})
            </Text>
          </View>
        </View>

        {/* ── Insights card ── */}
        <View style={styles.thickDivider} />

        <Pressable
          onPress={() => router.push("/insights")}
          style={({ pressed }) => [
            styles.insightsCard,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={styles.insightsCardLeft}>
            <View style={styles.insightsCardIcon}>
              <Feather name="cpu" size={18} color="#a78bfa" />
            </View>
            <View style={styles.insightsCardText}>
              <Text style={styles.insightsCardTitle}>
                View subject analytics
              </Text>
              <Text style={styles.insightsCardSub}>
                Smart Insights · Hardness · Time
              </Text>
            </View>
          </View>
          <View style={styles.insightsCardBtn}>
            <Text style={styles.insightsCardBtnText}>Open Insights</Text>
            <Feather name="arrow-right" size={13} color="#a78bfa" />
          </View>
        </Pressable>

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

    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8,
    },
    sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },

    // Ring + stat cards row
    ringRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      gap: 8,
      paddingBottom: 4,
    },
    statCardCol: { flex: 1, gap: 8 },
    ringWrapper: { width: RING_SIZE, height: RING_SIZE },
    ringCenter: {
      position: "absolute",
      top: 0,
      left: 0,
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    ringEyebrow: {
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 2.5,
      color: c.mutedForeground,
    },
    ringTime: {
      fontFamily: "Inter_700Bold",
      fontSize: 22,
      color: c.foreground,
      letterSpacing: -0.5,
      marginTop: 2,
    },

    detailsBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    detailsBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: c.foreground,
    },

    thickDivider: { height: 10, backgroundColor: c.muted, marginTop: 4 },

    // Shared section wrapper
    section: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
      gap: 12,
    },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    sectionIconBg: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeading: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: c.foreground,
      letterSpacing: -0.3,
    },
    sectionSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: c.mutedForeground,
      lineHeight: 18,
      marginTop: -6,
    },

    // Heatmap
    heatmapGrid: { flexDirection: "row", flexWrap: "wrap", gap: HEAT_GAP },
    heatCell: {
      borderRadius: 4,
    },
    heatCellToday: { borderWidth: 1.5, borderColor: "#22c55e" },
    heatLegend: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 2,
    },
    heatLegendCell: { width: 12, height: 12, borderRadius: 3 },
    heatLegendText: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: c.mutedForeground,
    },

    // Studied Today
    emptyCard: {
      alignItems: "center",
      gap: 12,
      paddingVertical: 32,
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
    sessionsList: { gap: 8 },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    sessionDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    sessionInfo: { flex: 1, gap: 2 },
    sessionTopicName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: c.foreground,
      lineHeight: 18,
    },
    sessionSubject: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 16,
    },
    sessionDuration: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      flexShrink: 0,
    },
    diffBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      flexShrink: 0,
    },
    diffBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

    // Goal bar chart
    chartArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 4,
      position: "relative",
    },
    goalLine: {
      position: "absolute",
      left: 0,
      right: 0,
      borderTopWidth: 1.5,
      borderStyle: "dashed",
      borderTopColor: "#22c55e80",
    },
    chartBar: { flex: 1, borderRadius: 4 },
    chartLabels: { flexDirection: "row", gap: 4, marginTop: 6 },
    chartLabel: { flex: 1, textAlign: "center", fontSize: 10 },
    goalLegend: { flexDirection: "row", alignItems: "center", gap: 8 },
    goalLegendLine: {
      width: 20,
      borderTopWidth: 1.5,
      borderStyle: "dashed",
    },
    goalLegendText: { fontFamily: "Inter_400Regular", fontSize: 12 },

    // Insights card
    insightsCard: {
      marginHorizontal: 20,
      marginVertical: 18,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "#a78bfa30",
      padding: 18,
      gap: 14,
    },
    insightsCardLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    insightsCardIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: "#a78bfa18",
      alignItems: "center",
      justifyContent: "center",
    },
    insightsCardText: { flex: 1, gap: 3 },
    insightsCardTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 15,
      color: c.foreground,
      letterSpacing: -0.2,
    },
    insightsCardSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: c.mutedForeground,
    },
    insightsCardBtn: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-end",
      gap: 6,
      backgroundColor: "#a78bfa18",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "#a78bfa35",
    },
    insightsCardBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: "#a78bfa",
    },
  });
}
