import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useExamMode } from "@/contexts/ExamModeContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Difficulty, useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import {
  daysSince,
  difficultyTrendValues,
  forgettingCurvePoints,
  nextReviewLabel,
} from "@/lib/topicAnalytics";
import { useSubscription } from "@/lib/revenuecat";

const DIFF_COLOR: Record<Difficulty, string> = {
  easy: "#22c55e",
  medium: "#f59e0b",
  hard: "#ef4444",
};


const BAR_W = 30;
const BAR_GAP = 10;
const CHART_H = 140;
const TREND_H = 44;
const LABEL_H = 28;
const SVG_CHART_H = CHART_H + TREND_H + LABEL_H;

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTime(totalMin: number): string {
  if (totalMin <= 0) return "0 min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getRevisionInsight(
  sessions: { minutes: number; difficulty: Difficulty }[],
): string {
  if (sessions.length < 3) return "Keep studying — insights appear after a few sessions.";
  const recent = sessions.slice(0, Math.min(3, sessions.length));
  const older = sessions.slice(3, Math.min(6, sessions.length));
  const recentAvg = recent.reduce((s, r) => s + r.minutes, 0) / recent.length;
  const olderAvg =
    older.length > 0
      ? older.reduce((s, r) => s + r.minutes, 0) / older.length
      : recentAvg;
  const DIFF_NUM: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
  const avgDiff =
    recent.reduce((s, r) => s + (DIFF_NUM[r.difficulty] ?? 2), 0) / recent.length;
  const timeDown = recentAvg < olderAvg * 0.85;
  const timeUp = recentAvg > olderAvg * 1.15;
  if (timeDown && avgDiff <= 1.5) return "Study time decreasing → mastery is improving.";
  if (timeDown && avgDiff >= 2.5) return "Less time but still difficult — stay consistent.";
  if (timeUp && avgDiff >= 2.5) return "More effort needed — this topic is challenging you.";
  if (avgDiff <= 1.3) return "Consistently easy sessions — you're mastering this!";
  if (avgDiff >= 2.7) return "Hard sessions streak — push through, it'll click soon.";
  if (recent.every((s) => s.difficulty === "easy")) return "Three easy in a row — confidence is rising!";
  return "Steady progress — keep the momentum going.";
}

export default function TopicDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getTopic, updateTopicMeta, deleteTopic } = useTopics();
  const { settings } = useSettings();
  const { isPro } = useSubscription();

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const { examModeActive, examSubject } = useExamMode();

  const topic = useMemo(() => (id ? getTopic(id) : null), [id, getTopic]);

  const [disabled, setDisabled] = useState<boolean>(topic?.disabled ?? false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDisabledToggle = useCallback(
    async (val: boolean) => {
      if (!topic) return;
      setDisabled(val);
      await updateTopicMeta(topic.id, { disabled: val });
    },
    [topic, updateTopicMeta],
  );

  const handleDeleteTopic = useCallback(async () => {
    if (!topic) return;
    await deleteTopic(topic.id);
    router.back();
  }, [topic, deleteTopic, router]);

  if (!topic) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
          Topic not found
        </Text>
        <Pressable
          onPress={() => router.back()}
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
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  const sessionsChron = [...topic.sessions].reverse();
  const revCount = topic.sessions.length;
  const totalMin = topic.totalMinutesStudied;
  const dayAgo = daysSince(topic.lastStudiedAt);
  const { text: reviewText, overdue: isOverdue } = nextReviewLabel(topic.nextReviewAt);

  const trendVals = difficultyTrendValues(topic.sessions);

  const lastSession = topic.sessions[0];
  const stability = lastSession?.effectiveDays ?? 2;
  const curvePoints = forgettingCurvePoints(stability, 14, 80);
  const daysSinceStudy = daysSince(topic.lastStudiedAt) ?? 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topInset,
          paddingBottom: bottomInset + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── GRADIENT HEADER ─── */}
        <LinearGradient
          colors={["#1e1b4b", "#0b1020"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGrad}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>

          <View style={styles.headerContent}>
            <Text style={styles.topicTitle} numberOfLines={3}>
              {topic.topicName}
            </Text>
          </View>
        </LinearGradient>

        {/* ─── STATS ROW ─── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={styles.statsRow}>
          <StatCard
            icon="repeat"
            label="Revisions"
            value={String(revCount)}
            tint="#a5b4fc"
            colors={colors}
          />
          <StatCard
            icon="clock"
            label="Total time"
            value={fmtTime(totalMin)}
            tint="#22d3ee"
            colors={colors}
          />
          <StatCard
            icon="calendar"
            label="Last studied"
            value={dayAgo === null ? "Never" : dayAgo === 0 ? "Today" : `${dayAgo}d ago`}
            tint="#f59e0b"
            colors={colors}
          />
        </ScrollView>

        {/* ─── BAR CHART ─── */}
        <SectionHeader colors={colors} title="Revision Time" icon="bar-chart-2" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {sessionsChron.length === 0 ? (
            <EmptyChart colors={colors} />
          ) : (
            <RevisionBarChart
              sessions={sessionsChron}
              focusMinutes={settings.focusMinutes}
              trendVals={trendVals}
              colors={colors}
            />
          )}
          <Text style={[styles.chartHint, { color: colors.mutedForeground }]}>
            Green = easy · Amber = medium · Red = hard · Faint = planned
          </Text>
          {!isPro ? <ProChartOverlay onPress={() => router.push("/paywall")} /> : null}
        </View>

        {/* ─── REVISION INSIGHT ─── */}
        {sessionsChron.length >= 2 ? (
          <View style={[styles.insightBanner, { borderColor: colors.border, backgroundColor: `${colors.primary}12` }]}>
            <Feather name="trending-up" size={13} color={colors.primary} />
            <Text style={[styles.insightText, { color: colors.mutedForeground }]}>
              {getRevisionInsight(sessionsChron)}
            </Text>
          </View>
        ) : null}

        {/* ─── FORGETTING CURVE ─── */}
        <SectionHeader colors={colors} title="Memory Retention" icon="activity" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {lastSession ? (
            <>
              <ForgettingCurve
                curvePoints={curvePoints}
                daysSinceStudy={daysSinceStudy}
                nextReviewAt={topic.nextReviewAt}
                stability={stability}
                colors={colors}
              />
              <View style={styles.retentionScoreRow}>
                <Text style={[styles.retentionScoreLabel, { color: colors.mutedForeground }]}>
                  Retention score
                </Text>
                <Text
                  style={[
                    styles.retentionScoreValue,
                    {
                      color:
                        Math.round(Math.max(0, Math.min(1, Math.exp(-daysSinceStudy / Math.max(0.5, stability)))) * 100) >= 70
                          ? "#22c55e"
                          : Math.round(Math.max(0, Math.min(1, Math.exp(-daysSinceStudy / Math.max(0.5, stability)))) * 100) >= 40
                            ? "#f59e0b"
                            : "#ef4444",
                    },
                  ]}
                >
                  {Math.round(
                    Math.max(0, Math.min(1, Math.exp(-daysSinceStudy / Math.max(0.5, stability)))) * 100,
                  )}%
                </Text>
              </View>
            </>
          ) : (
            <EmptyChart colors={colors} label="Complete a session to see your retention curve" />
          )}
          <View
            style={[
              styles.reviewLabel,
              { backgroundColor: isOverdue ? "#ef444420" : "#22d3ee20" },
            ]}
          >
            <Feather
              name={isOverdue ? "alert-triangle" : "clock"}
              size={13}
              color={isOverdue ? "#ef4444" : "#22d3ee"}
            />
            <Text style={[styles.reviewText, { color: isOverdue ? "#ef4444" : "#22d3ee" }]}>
              {reviewText}
            </Text>
          </View>
          {!isPro ? <ProChartOverlay onPress={() => router.push("/paywall")} /> : null}
        </View>

        {/* ─── SCHEDULE TOGGLE ─── */}
        <SectionHeader colors={colors} title="Revision Schedule" icon="calendar" />
        <View
          style={[
            styles.card,
            styles.toggleRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
              Include in revision schedule
            </Text>
            <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
              {disabled
                ? "Paused — won't appear in daily plan"
                : "Active — appears in your daily plan"}
            </Text>
          </View>
          <Switch
            value={!disabled}
            onValueChange={(val) => handleDisabledToggle(!val)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={!disabled ? "#fff" : colors.mutedForeground}
          />
        </View>

        {/* ─── CTA ─── */}
        <View style={styles.ctaWrap}>
          <PrimaryButton
            title="Start Focus Session"
            onPress={() =>
              router.push({ pathname: "/focus", params: { topicId: topic.id } })
            }
          />
          <Pressable
            onPress={() => setShowDeleteModal(true)}
            style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="trash-2" size={15} color="#ef4444" />
            <Text style={styles.deleteBtnText}>Delete this topic</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ─── DELETE CONFIRMATION MODAL ─── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDeleteModal(false)}>
          <View style={styles.deleteModalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.deleteModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.deleteModalIcon}>
                  <Feather name="trash-2" size={24} color="#ef4444" />
                </View>
                <Text style={[styles.deleteModalTitle, { color: colors.foreground }]}>
                  Delete topic?
                </Text>
                <Text style={[styles.deleteModalSub, { color: colors.mutedForeground }]}>
                  "{topic.topicName}" and all its session data will be permanently removed.
                </Text>
                <View style={styles.deleteModalRow}>
                  <Pressable
                    onPress={() => setShowDeleteModal(false)}
                    style={({ pressed }) => [
                      styles.deleteModalCancel,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.deleteModalCancelText, { color: colors.foreground }]}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteTopic}
                    style={({ pressed }) => [
                      styles.deleteModalConfirm,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={styles.deleteModalConfirmText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  tint: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Feather name={icon} size={15} color={tint} />
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  colors,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Feather name={icon} size={14} color={colors.mutedForeground} />
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
    </View>
  );
}

function EmptyChart({
  colors,
  label = "No sessions recorded yet",
}: {
  colors: ReturnType<typeof useColors>;
  label?: string;
}) {
  return (
    <View style={styles.emptyChart}>
      <Feather name="bar-chart" size={24} color={colors.border} />
      <Text style={[styles.emptyChartText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function SessionLogRow({
  session,
  colors,
  isLast,
}: {
  session: import("@/contexts/TopicsContext").StudySession;
  colors: ReturnType<typeof useColors>;
  isLast: boolean;
}) {
  const capApplied = session.effectiveDays < session.requestedDays;
  const diffColor = DIFF_COLOR[session.difficulty];
  return (
    <View
      style={[
        styles.logRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.logDiffDot, { backgroundColor: diffColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.logDate, { color: colors.foreground }]}>
          {fmtDate(session.startedAt)}
        </Text>
        <Text style={[styles.logMeta, { color: colors.mutedForeground }]}>
          {fmtTime(session.minutes)} · {session.difficulty}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.logInterval, { color: colors.foreground }]}>
          {session.effectiveDays === 1 ? "next day" : `+${session.effectiveDays}d`}
        </Text>
        {capApplied ? (
          <Text style={[styles.logCap, { color: "#f97316" }]}>
            capped from {session.requestedDays}d
          </Text>
        ) : null}
      </View>
    </View>
  );
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
        <Text style={proOverlayStyles.sub}>Upgrade to unlock detailed charts</Text>
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

function RevisionBarChart({
  sessions,
  focusMinutes,
  trendVals,
  colors,
}: {
  sessions: { minutes: number; difficulty: Difficulty; startedAt: number }[];
  focusMinutes: number;
  trendVals: number[];
  colors: ReturnType<typeof useColors>;
}) {
  const n = sessions.length;
  const svgWidth = Math.max(BAR_GAP + n * (BAR_W + BAR_GAP), 280);
  const maxMin = Math.max(...sessions.map((s) => s.minutes), focusMinutes, 1);

  const barH = (min: number) => Math.max(4, (min / maxMin) * CHART_H);
  const plannedH = barH(focusMinutes);

  const trendPoints = sessions
    .map((_, i) => {
      const x = BAR_GAP + i * (BAR_W + BAR_GAP) + BAR_W / 2;
      const dv = trendVals[i] ?? 2;
      const y = CHART_H + 8 + ((dv - 1) / 2) * (TREND_H - 16);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
      <Svg width={svgWidth} height={SVG_CHART_H}>
        {sessions.map((s, i) => {
          const x = BAR_GAP + i * (BAR_W + BAR_GAP);
          const actualH = barH(s.minutes);
          const color = DIFF_COLOR[s.difficulty];
          const dateLabel = fmtDate(s.startedAt);
          return (
            <React.Fragment key={s.startedAt + i}>
              {/* Planned bar (background) */}
              <Rect
                x={x}
                y={CHART_H - plannedH}
                width={BAR_W}
                height={plannedH}
                rx={4}
                fill={`${color}28`}
              />
              {/* Actual bar */}
              <Rect
                x={x}
                y={CHART_H - actualH}
                width={BAR_W}
                height={actualH}
                rx={4}
                fill={color}
                opacity={0.9}
              />
              {/* Minutes label on taller bars */}
              {s.minutes >= 5 ? (
                <SvgText
                  x={x + BAR_W / 2}
                  y={CHART_H - actualH - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="Inter_600SemiBold"
                  fill={color}
                >
                  {s.minutes}m
                </SvgText>
              ) : null}
              {/* Date label */}
              <SvgText
                x={x + BAR_W / 2}
                y={CHART_H + TREND_H + 18}
                textAnchor="middle"
                fontSize={8}
                fontFamily="Inter_500Medium"
                fill="#94a3b8"
              >
                {dateLabel}
              </SvgText>
            </React.Fragment>
          );
        })}
        {/* Baseline */}
        <Line x1={0} y1={CHART_H} x2={svgWidth} y2={CHART_H} stroke="#334155" strokeWidth={1} />
        {/* Trend divider */}
        <Line
          x1={0}
          y1={CHART_H + TREND_H}
          x2={svgWidth}
          y2={CHART_H + TREND_H}
          stroke="#1e293b"
          strokeWidth={1}
        />
        {/* Trend labels */}
        <SvgText
          x={2}
          y={CHART_H + 10}
          fontSize={7}
          fontFamily="Inter_500Medium"
          fill="#22c55e"
        >
          Easy
        </SvgText>
        <SvgText
          x={2}
          y={CHART_H + TREND_H / 2 + 3}
          fontSize={7}
          fontFamily="Inter_500Medium"
          fill="#f59e0b"
        >
          Med
        </SvgText>
        <SvgText
          x={2}
          y={CHART_H + TREND_H - 4}
          fontSize={7}
          fontFamily="Inter_500Medium"
          fill="#ef4444"
        >
          Hard
        </SvgText>
        {/* Difficulty trend line */}
        {n > 1 ? (
          <Polyline
            points={trendPoints}
            fill="none"
            stroke="#a5b4fc"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {/* Trend dots */}
        {sessions.map((s, i) => {
          const x = BAR_GAP + i * (BAR_W + BAR_GAP) + BAR_W / 2;
          const dv = trendVals[i] ?? 2;
          const y = CHART_H + 8 + ((dv - 1) / 2) * (TREND_H - 16);
          return (
            <Circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={3}
              fill={DIFF_COLOR[s.difficulty]}
            />
          );
        })}
      </Svg>
    </ScrollView>
  );
}

function ForgettingCurve({
  curvePoints,
  daysSinceStudy,
  nextReviewAt,
  stability,
  colors,
}: {
  curvePoints: { t: number; r: number }[];
  daysSinceStudy: number;
  nextReviewAt: number | null;
  stability: number;
  colors: ReturnType<typeof useColors>;
}) {
  const W = 280;
  const H = 110;
  const PAD_L = 28;
  const PAD_R = 12;
  const PAD_T = 10;
  const PAD_B = 22;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;
  const totalDays = 14;

  const toX = (t: number) => PAD_L + (t / totalDays) * cW;
  const toY = (r: number) => PAD_T + (1 - r) * cH;

  const pathD = curvePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.t).toFixed(1)} ${toY(p.r).toFixed(1)}`)
    .join(" ");

  const todayX = toX(Math.min(daysSinceStudy, totalDays));
  const todayRetention = Math.exp(-daysSinceStudy / Math.max(0.5, stability));

  const nextDaysFromNow = nextReviewAt
    ? Math.round((nextReviewAt - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  const reviewX =
    nextDaysFromNow !== null
      ? toX(Math.min(Math.max(0, daysSinceStudy + nextDaysFromNow), totalDays))
      : null;

  const threshold70Y = toY(0.7);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={W} height={H}>
        {/* 70% threshold line */}
        <Line
          x1={PAD_L}
          y1={threshold70Y}
          x2={W - PAD_R}
          y2={threshold70Y}
          stroke="#475569"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        <SvgText
          x={PAD_L - 2}
          y={threshold70Y + 4}
          textAnchor="end"
          fontSize={8}
          fill="#475569"
          fontFamily="Inter_500Medium"
        >
          70%
        </SvgText>
        {/* Curve fill */}
        <Defs>
          <SvgGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#a5b4fc" stopOpacity="0.3" />
            <Stop offset="1" stopColor="#a5b4fc" stopOpacity="0.02" />
          </SvgGradient>
        </Defs>
        <Path
          d={`${pathD} L ${toX(totalDays).toFixed(1)} ${toY(0).toFixed(1)} L ${PAD_L} ${toY(0).toFixed(1)} Z`}
          fill="url(#curveGrad)"
        />
        {/* Curve line */}
        <Path d={pathD} stroke="#a5b4fc" strokeWidth={2} fill="none" strokeLinecap="round" />
        {/* Today marker */}
        <Line
          x1={todayX}
          y1={PAD_T}
          x2={todayX}
          y2={H - PAD_B}
          stroke="#22d3ee"
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />
        <Circle cx={todayX} cy={toY(todayRetention)} r={4} fill="#22d3ee" />
        <SvgText
          x={todayX + 4}
          y={PAD_T + 10}
          fontSize={8}
          fill="#22d3ee"
          fontFamily="Inter_600SemiBold"
        >
          Now
        </SvgText>
        {/* Next review marker */}
        {reviewX !== null ? (
          <>
            <Line
              x1={reviewX}
              y1={PAD_T}
              x2={reviewX}
              y2={H - PAD_B}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4,3"
            />
            <SvgText
              x={reviewX + 4}
              y={PAD_T + 10}
              fontSize={8}
              fill="#f59e0b"
              fontFamily="Inter_600SemiBold"
            >
              Review
            </SvgText>
          </>
        ) : null}
        {/* X axis labels */}
        {[0, 7, 14].map((d) => (
          <SvgText
            key={d}
            x={toX(d)}
            y={H - 4}
            textAnchor="middle"
            fontSize={8}
            fill="#64748b"
            fontFamily="Inter_500Medium"
          >
            {d === 0 ? "0d" : d === 7 ? "7d" : "14d"}
          </SvgText>
        ))}
        {/* Y axis labels */}
        {[100, 70, 0].map((pct) => (
          pct !== 70 ? (
            <SvgText
              key={pct}
              x={PAD_L - 2}
              y={toY(pct / 100) + 4}
              textAnchor="end"
              fontSize={8}
              fill="#475569"
              fontFamily="Inter_500Medium"
            >
              {pct}%
            </SvgText>
          ) : null
        ))}
      </Svg>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  notFoundText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    marginTop: 12,
  },
  headerGrad: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  backBtn: {
    marginTop: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: { gap: 6 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  subjectBadge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#22d3ee",
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(249,115,22,0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.4)",
  },
  priorityText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#f97316",
  },
  topicTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#fff",
    letterSpacing: -0.4,
  },
  statsScroll: {
    marginTop: -12,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingRight: 16,
  },
  statCard: {
    width: 92,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  chartHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  emptyChart: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyChartText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  reviewLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reviewText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  toggleSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  ctaWrap: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  logDiffDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logDate: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  logMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
    textTransform: "capitalize",
  },
  logInterval: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  logCap: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 1,
  },
  insightBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  insightText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  retentionScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.2)",
  },
  retentionScoreLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  retentionScoreValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#ef4444",
  },
  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  deleteModalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    gap: 12,
    alignItems: "center",
  },
  deleteModalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  deleteModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  deleteModalSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  deleteModalRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    width: "100%",
  },
  deleteModalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  deleteModalCancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  deleteModalConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  deleteModalConfirmText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
});
