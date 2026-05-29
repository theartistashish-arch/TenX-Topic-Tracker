import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { Circle, G, Svg } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Topic, useTopics } from "@/contexts/TopicsContext";
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

// Ring geometry
const RING_R = 108;
const RING_STROKE = 10;
const RING_SIZE = 300;
const RING_CX = 150;
const RING_CY = 150;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const GAP_ARC = 8;
const LABEL_RADIUS = 130;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function subjectColor(subject: string, allSubjects: string[]): string {
  const idx = allSubjects.indexOf(subject);
  return SUBJECT_PALETTE[(idx < 0 ? 0 : idx) % SUBJECT_PALETTE.length]!;
}

// ── Today data ──────────────────────────────────────────────────────────────

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
  totalPauses: number;
  totalMin: number;
} {
  const todayStart = startOfDay(Date.now());
  const allSubjects = Array.from(new Set(topics.map((t) => t.subject)));
  const subjectMap = new Map<string, number>();
  const topicsReadSet = new Set<string>();
  const topicsRead: TodayTopicEntry[] = [];
  let totalPauses = 0;

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
        totalPauses += s.pauseCount ?? 0;
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
  return { subjects, topicsRead, totalPauses, totalMin };
}

interface RingSegment {
  subject: string;
  color: string;
  arcLen: number;
  startArc: number;
  midAngle: number;
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
    const midAngle =
      ((startArc + arcLen / 2) / CIRCUMFERENCE) * 2 * Math.PI - Math.PI / 2;
    cumArc += arcLen + (gapCount > 0 ? GAP_ARC : 0);
    return { subject: s.subject, color: s.color, arcLen, startArc, midAngle };
  });
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function PulseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topics, isLoading } = useTopics();
  const [topicsModalOpen, setTopicsModalOpen] = useState(false);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const { subjects, topicsRead, totalPauses, totalMin } = useMemo(
    () => buildTodayData(topics),
    [topics],
  );
  const segments = useMemo(() => computeSegments(subjects), [subjects]);

  const allSubjects = useMemo(
    () => Array.from(new Set(topics.map((t) => t.subject))),
    [topics],
  );

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (isLoading) {
    return (
      <View
        style={[styles.root, styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Fixed header ── */}
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
        {/* ── Section title row ── */}
        <View style={styles.sectionTitleRow}>
          <Feather name="bar-chart-2" size={20} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Study Pulse
          </Text>
        </View>

        {/* ── Ring ── */}
        <Pressable
          onPress={() => router.push("/study-activity")}
          style={{ alignSelf: "center", marginTop: 4 }}
        >
          <View style={styles.ringWrapper}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
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

            {segments.map((seg) => {
              const cosA = Math.cos(seg.midAngle);
              const sinA = Math.sin(seg.midAngle);
              const lx = RING_CX + LABEL_RADIUS * cosA;
              const ly = RING_CY + LABEL_RADIUS * sinA;
              const label =
                seg.subject.length > 10
                  ? seg.subject.slice(0, 9) + "…"
                  : seg.subject;
              const labelStyle: object =
                cosA > 0.2
                  ? { left: lx + 4, top: ly - 9 }
                  : cosA < -0.2
                    ? { right: RING_SIZE - lx + 4, top: ly - 9 }
                    : { left: lx - 40, width: 80, top: ly - 9 };
              return (
                <Text
                  key={`lbl-${seg.subject}`}
                  style={[styles.segLabel, { color: seg.color }, labelStyle]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              );
            })}

            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={styles.ringEyebrow}>TODAY</Text>
              <Text style={styles.ringTime}>
                {totalMin === 0 ? "0 min" : formatHoursMinutes(totalMin)}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* ── Two stat blocks ── */}
        <View style={styles.statsRow}>
          <Pressable
            style={styles.statBlock}
            onPress={() => setTopicsModalOpen(true)}
          >
            <Text style={styles.statNumber}>{topicsRead.length}</Text>
            <Text style={styles.statLabel}>Today read topics</Text>
          </Pressable>

          <View style={styles.statSep} />

          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{totalPauses}</Text>
            <Text style={styles.statLabel}>Pauses</Text>
          </View>
        </View>

        {/* ── Info row ── */}
        <View style={styles.infoRow}>
          <Feather name="info" size={15} color={colors.mutedForeground} />
          <Text style={styles.infoText}>
            Ring shows today's subject split. Analytics below cover all-time
            data.
          </Text>
        </View>

        {/* ── View Study activity details ── */}
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

        {/* ── View Insights card ── */}
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

      {/* ── Topics read modal ── */}
      <Modal
        visible={topicsModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTopicsModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTopicsModalOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => null}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Today's topics</Text>
            {topicsRead.length === 0 ? (
              <Text style={styles.modalEmpty}>
                No topics studied today yet.
              </Text>
            ) : (
              topicsRead.map((t) => {
                const color = subjectColor(t.subject, allSubjects);
                return (
                  <View key={t.topicId} style={styles.modalTopicRow}>
                    <View
                      style={[
                        styles.modalDot,
                        { backgroundColor: `${color}22`, borderColor: color },
                      ]}
                    >
                      <Text style={[styles.modalInitial, { color }]}>
                        {t.subject.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.modalTopicName} numberOfLines={2}>
                      {t.topicName}
                    </Text>
                  </View>
                );
              })
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    centered: { alignItems: "center", justifyContent: "center" },

    /* Header */
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

    /* Section title */
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: c.foreground,
    },

    /* Ring */
    ringWrapper: {
      width: RING_SIZE,
      height: RING_SIZE,
      position: "relative",
      overflow: "visible",
    },
    segLabel: {
      position: "absolute",
      fontFamily: "Inter_600SemiBold",
      fontSize: 11,
      letterSpacing: 0.2,
    },
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
      fontSize: 12,
      letterSpacing: 2.5,
      color: c.mutedForeground,
    },
    ringTime: {
      fontFamily: "Inter_700Bold",
      fontSize: 28,
      color: c.foreground,
      letterSpacing: -0.5,
      marginTop: 4,
    },

    /* Stats */
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 8,
    },
    statBlock: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
    },
    statNumber: {
      fontFamily: "Inter_700Bold",
      fontSize: 32,
      color: c.foreground,
      letterSpacing: -1,
      lineHeight: 40,
    },
    statLabel: {
      fontFamily: "Inter_500Medium",
      fontSize: 12,
      color: c.mutedForeground,
      marginTop: 2,
      textAlign: "center",
    },
    statSep: {
      width: 1,
      height: 56,
      backgroundColor: c.border,
    },

    /* Info */
    infoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    infoText: {
      flex: 1,
      color: c.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      lineHeight: 19,
    },

    /* Details link */
    detailsBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    detailsBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      color: c.foreground,
    },

    /* Thick divider */
    thickDivider: {
      height: 10,
      backgroundColor: c.muted,
      marginTop: 4,
    },

    /* Insights link card */
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
    insightsCardText: {
      flex: 1,
      gap: 3,
    },
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

    /* Topics modal */
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 22,
      paddingBottom: 42,
      gap: 2,
    },
    modalHandle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center",
      marginBottom: 14,
    },
    modalTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 19,
      color: c.foreground,
      marginBottom: 10,
    },
    modalTopicRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalDot: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    modalInitial: {
      fontFamily: "Inter_700Bold",
      fontSize: 15,
    },
    modalTopicName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: c.foreground,
      flex: 1,
      lineHeight: 21,
    },
    modalEmpty: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      color: c.mutedForeground,
      textAlign: "center",
      paddingVertical: 22,
    },
  });
}

