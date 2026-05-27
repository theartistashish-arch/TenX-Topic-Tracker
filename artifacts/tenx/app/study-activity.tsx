import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MAX_BUDGET_MIN,
  MIN_BUDGET_MIN,
  useSettings,
} from "@/contexts/SettingsContext";
import { Topic, useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { formatHoursMinutes } from "@/lib/insights";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SUBJECT_PALETTE = [
  "#22d3ee", "#a78bfa", "#f59e0b", "#34d399",
  "#f87171", "#818cf8", "#fb923c", "#e879f9",
  "#60a5fa", "#4ade80",
];

const GREEN = "#22c55e";
const YELLOW = "#f59e0b";
const RED = "#ef4444";

function barColor(minutes: number, goalMin: number, mutedColor: string): string {
  if (minutes === 0) return mutedColor;
  if (goalMin <= 0) return mutedColor;
  const pct = minutes / goalMin;
  if (pct >= 1) return GREEN;
  if (pct >= 0.85) return YELLOW;
  return RED;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function subjectColor(subject: string, allSubjects: string[]): string {
  const idx = allSubjects.indexOf(subject);
  return SUBJECT_PALETTE[(idx < 0 ? 0 : idx) % SUBJECT_PALETTE.length]!;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

interface DayStat {
  label: string;
  minutes: number;
  isSelected: boolean;
  dayStart: number;
}

interface TopicDayStat {
  topicId: string;
  topicName: string;
  subject: string;
  color: string;
  minutes: number;
}

function buildActivityData(topics: Topic[], dayOffset: number) {
  const now = Date.now();
  const todayStart = startOfDay(now);
  const targetDayStart = todayStart - dayOffset * DAY_MS;
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));

  // Find earliest study date across all sessions
  let earliestStart = todayStart;
  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      const sDay = startOfDay(s.startedAt);
      if (sDay < earliestStart) earliestStart = sDay;
    }
  }

  // Always show at least 14 days so chart looks good even for new users
  const minDays = 14;
  const totalDays = Math.max(minDays, Math.floor((todayStart - earliestStart) / DAY_MS) + 1);

  const dayStat: DayStat[] = Array.from({ length: totalDays }, (_, i) => {
    const dayStart = earliestStart + i * DAY_MS;
    return {
      label: WEEKDAY_SHORT[new Date(dayStart).getDay()] ?? "",
      minutes: 0,
      isSelected: dayStart === targetDayStart,
      dayStart,
    };
  });

  const topicMap = new Map<string, TopicDayStat>();

  for (const topic of topics) {
    for (const s of topic.sessions ?? []) {
      const sDay = startOfDay(s.startedAt);
      const bucket = dayStat.find((d) => d.dayStart === sDay);
      if (bucket) bucket.minutes += s.minutes ?? 0;
      if (sDay === targetDayStart) {
        const prev = topicMap.get(topic.id);
        if (prev) {
          prev.minutes += s.minutes ?? 0;
        } else {
          topicMap.set(topic.id, {
            topicId: topic.id,
            topicName: topic.topicName,
            subject: topic.subject,
            color: subjectColor(topic.subject, allSubjects),
            minutes: s.minutes ?? 0,
          });
        }
      }
    }
  }

  const selectedDay = dayStat.find((d) => d.isSelected);
  const selectedDayMin = selectedDay?.minutes ?? 0;
  const topicList = Array.from(topicMap.values()).sort((a, b) => b.minutes - a.minutes);
  return { dayStat, selectedDayMin, topicList, selectedDayTs: targetDayStart, totalDays };
}

// Chart height in px (bar area only)
const CHART_H = 160;

export default function StudyActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topics, isLoading } = useTopics();
  const { settings, updateSettings } = useSettings();
  const [dayOffset, setDayOffset] = useState(0);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const { dayStat, selectedDayMin, topicList, selectedDayTs, totalDays } = useMemo(
    () => buildActivityData(topics, dayOffset),
    [topics, dayOffset],
  );

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const peakMin = dayStat.reduce((m, d) => Math.max(m, d.minutes), 0);
  // Always fit the goal line inside the chart area
  const goalMin = settings.dailyBudgetMin;
  const maxGrid = Math.max(60, peakMin, goalMin);
  const goalRatio = maxGrid > 0 ? goalMin / maxGrid : 0;
  // bottom offset of goal line inside chartBody (bars start at bottom:24)
  const goalLineBottom = 24 + goalRatio * CHART_H;
  const isToday = dayOffset === 0;

  if (isLoading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topInset + 6, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Study activity details</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
      >
        {/* ── Study time chip + legend ── */}
        <Pressable
          onPress={() => setGoalModalOpen(true)}
          style={styles.chipRow}
        >
          <View style={[styles.chip, { opacity: 1 }]}>
            <Text style={styles.chipText}>Study time</Text>
            <Feather name="chevron-down" size={14} color={colors.foreground} />
          </View>
        </Pressable>

        {/* Colour legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: GREEN }]} />
            <Text style={styles.legendText}>Goal reached</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: YELLOW }]} />
            <Text style={styles.legendText}>≥ 85%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RED }]} />
            <Text style={styles.legendText}>Below 85%</Text>
          </View>
        </View>

        {/* ── Bar chart ── */}
        <View style={styles.chartSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
            ref={scrollRef}
          >

            {/* Bars */}
            <View style={[styles.barsRow, { paddingHorizontal: 6 }]}>
              {dayStat.map((d, i) => {
                const ratio = maxGrid > 0 ? d.minutes / maxGrid : 0;
                const barH = Math.max(d.minutes > 0 ? 6 : 2, ratio * CHART_H);
                const barDayOffset = Math.floor((startOfDay(Date.now()) - d.dayStart) / DAY_MS);
                const fillColor = barColor(d.minutes, goalMin, colors.muted);
                return (
                  <Pressable
                    key={`bar-${i}`}
                    style={styles.barCol}
                    onPress={() => setDayOffset(barDayOffset)}
                  >
                    <View style={styles.barTrack}>
                      {d.minutes > 0 && (
                        <Text style={[styles.barTimeLabel, { bottom: barH + 3 }]}>
                          {formatHoursMinutes(d.minutes)}
                        </Text>
                      )}
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: barH,
                            backgroundColor: fillColor,
                            opacity: d.isSelected ? 1 : 0.82,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.barLabel,
                        d.isSelected && {
                          color: d.minutes === 0 ? colors.accent : fillColor,
                          fontFamily: "Inter_700Bold",
                        },
                      ]}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* ── Day navigation ── */}
        <View style={styles.navRow}>
          <Pressable
            onPress={() => setDayOffset((p) => Math.min(p + 7, totalDays - 1))}
            disabled={dayOffset >= totalDays - 1}
            style={({ pressed }) => [
              styles.navBtn,
              { opacity: pressed ? 0.6 : dayOffset >= totalDays - 1 ? 0.25 : 1 },
            ]}
          >
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>

          <View style={styles.navCenter}>
            <Text style={styles.navDateText}>
              {isToday ? "Today" : formatDate(selectedDayTs)}
            </Text>
            {!isToday && (
              <Pressable onPress={() => setDayOffset(0)} hitSlop={8}>
                <Text style={styles.navBackLink}>Back to today</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setDayOffset((p) => Math.max(p - 7, 0))}
            disabled={dayOffset <= 0}
            style={({ pressed }) => [
              styles.navBtn,
              { opacity: pressed ? 0.6 : dayOffset <= 0 ? 0.25 : 1 },
            ]}
          >
            <Feather name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* ── Topic list ── */}
        {topicList.length > 0 ? (
          topicList.map((t, i) => (
            <View key={t.topicId}>
              <View style={styles.topicRow}>
                {/* Subject-colored circle */}
                <View
                  style={[
                    styles.topicCircle,
                    { backgroundColor: `${t.color}1a`, borderColor: t.color },
                  ]}
                >
                  <Text style={[styles.topicInitial, { color: t.color }]}>
                    {t.subject.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Topic name + time */}
                <View style={styles.topicInfo}>
                  <Text style={styles.topicName} numberOfLines={2}>
                    {t.topicName}
                  </Text>
                  <Text style={styles.topicTime}>
                    {t.minutes} {t.minutes === 1 ? "minute" : "minutes"}
                  </Text>
                </View>

                {/* Vertical divider */}
                <View style={styles.topicDivider} />

                {/* Clock icon */}
                <Feather name="clock" size={18} color={colors.mutedForeground} />
              </View>

              {i < topicList.length - 1 && (
                <View style={styles.topicSep} />
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Feather name="book-open" size={30} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No study sessions on this day.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Daily goal modal ── */}
      <Modal
        visible={goalModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setGoalModalOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => null}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Daily study goal</Text>
            <Text style={styles.modalSub}>
              Set how long you want to study each day.
            </Text>

            <View style={styles.goalValueRow}>
              <Text style={styles.goalValue}>
                {settings.dailyBudgetMin >= 60
                  ? `${Math.round((settings.dailyBudgetMin / 60) * 10) / 10} h`
                  : `${settings.dailyBudgetMin} min`}
              </Text>
            </View>

            <View style={styles.goalStepper}>
              <Pressable
                onPress={() =>
                  updateSettings({
                    dailyBudgetMin: Math.max(
                      MIN_BUDGET_MIN,
                      settings.dailyBudgetMin - 15,
                    ),
                  })
                }
                disabled={settings.dailyBudgetMin <= MIN_BUDGET_MIN}
                style={({ pressed }) => [
                  styles.goalStepBtn,
                  {
                    opacity:
                      pressed || settings.dailyBudgetMin <= MIN_BUDGET_MIN
                        ? 0.4
                        : 1,
                  },
                ]}
              >
                <Feather name="minus" size={18} color={colors.foreground} />
              </Pressable>
              <Text style={styles.goalStepLabel}>
                {settings.dailyBudgetMin} min
              </Text>
              <Pressable
                onPress={() =>
                  updateSettings({
                    dailyBudgetMin: Math.min(
                      MAX_BUDGET_MIN,
                      settings.dailyBudgetMin + 15,
                    ),
                  })
                }
                disabled={settings.dailyBudgetMin >= MAX_BUDGET_MIN}
                style={({ pressed }) => [
                  styles.goalStepBtn,
                  {
                    opacity:
                      pressed || settings.dailyBudgetMin >= MAX_BUDGET_MIN
                        ? 0.4
                        : 1,
                  },
                ]}
              >
                <Feather name="plus" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => setGoalModalOpen(false)}
              style={({ pressed }) => [
                styles.goalDoneBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.goalDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.background,
    },
    centered: { alignItems: "center", justifyContent: "center" },

    /* Header */
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: c.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: c.foreground,
      letterSpacing: -0.2,
    },

    /* Chip */
    chipRow: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 4,
      alignItems: "center",
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: c.foreground,
    },

    /* Chart */
    chartSection: {
      paddingHorizontal: 20,
      marginTop: 4,
      marginBottom: 8,
    },
    chartBody: {
      height: CHART_H + 34,
      position: "relative",
    },
    barsRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 5,
      paddingVertical: 4,
    },
    barCol: {
      width: 36,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    barTrack: {
      width: "100%",
      height: CHART_H,
      justifyContent: "flex-end",
    },
    barFill: {
      width: "100%",
      borderRadius: 5,
    },
    barLabel: {
      color: c.mutedForeground,
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      marginTop: 8,
      textAlign: "center",
    },
    barLabelSelected: {
      color: c.accent,
      fontFamily: "Inter_700Bold",
    },

    /* Goal line */
    goalLineWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    goalLineLine: {
      flex: 1,
      height: 1.5,
      backgroundColor: c.mutedForeground,
      borderStyle: "dashed",
    },
    goalLinePill: {
      backgroundColor: c.muted,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: c.border,
    },
    goalLinePillText: {
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      color: c.mutedForeground,
      letterSpacing: 0.2,
    },

    /* Legend */
    legendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 20,
      paddingBottom: 10,
      flexWrap: "wrap",
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    goalLineDot: {
      width: 14,
      height: 2,
      backgroundColor: c.mutedForeground,
    },
    legendText: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      color: c.mutedForeground,
    },
    barTimeLabel: {
      position: "absolute",
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      color: c.mutedForeground,
      lineHeight: 12,
    },

    /* Day nav */
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      marginTop: 2,
    },
    navBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    navCenter: {
      flex: 1,
      alignItems: "center",
      gap: 4,
    },
    navDateText: {
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      color: c.foreground,
    },
    navBackLink: {
      fontFamily: "Inter_500Medium",
      fontSize: 12,
      color: c.primary,
    },

    /* Topic list */
    topicRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
      backgroundColor: c.background,
    },
    topicCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    topicInitial: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
    },
    topicInfo: { flex: 1 },
    topicName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: c.foreground,
      lineHeight: 21,
    },
    topicTime: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: c.mutedForeground,
      marginTop: 2,
    },
    topicDivider: {
      width: 1,
      height: 38,
      backgroundColor: c.border,
    },
    topicSep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginLeft: 80,
    },

    /* Empty */
    emptyBox: {
      alignItems: "center",
      gap: 12,
      paddingVertical: 48,
    },
    emptyText: {
      color: c.mutedForeground,
      fontFamily: "Inter_500Medium",
      fontSize: 14,
    },

    /* Goal modal */
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 24,
      paddingBottom: 44,
      gap: 8,
    },
    modalHandle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center",
      marginBottom: 12,
    },
    modalTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 20,
      color: c.foreground,
      textAlign: "center",
    },
    modalSub: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      color: c.mutedForeground,
      textAlign: "center",
      marginBottom: 10,
    },
    goalValueRow: {
      alignItems: "center",
      paddingVertical: 16,
    },
    goalValue: {
      fontFamily: "Inter_700Bold",
      fontSize: 40,
      color: c.primary,
      letterSpacing: -1,
    },
    goalStepper: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 22,
      paddingVertical: 12,
    },
    goalStepBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    goalStepLabel: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      color: c.foreground,
      minWidth: 70,
      textAlign: "center",
    },
    goalDoneBtn: {
      marginTop: 18,
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
    },
    goalDoneText: {
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      color: "#fff",
    },
  });
}
