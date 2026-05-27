import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useColors } from "@/hooks/useColors";


/* ── Feature cards ───────────────────────────────────────────────────────── */

interface Feature {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  tint: string;
}

const FEATURES: Feature[] = [
  {
    icon: "book-open",
    title: "Smart Library",
    body:
      "Organise every subject and topic in one place. Topter remembers what you studied and when, so you never lose track.",
    tint: "#4f46e5",
  },
  {
    icon: "clock",
    title: "Focus Timer",
    body:
      "Set custom focus blocks, break reminders, and pause warnings. Stay in deep work mode without burning out.",
    tint: "#22d3ee",
  },
  {
    icon: "activity",
    title: "Pulse & Streaks",
    body:
      "Visual stats, daily streaks, and weekly hours keep you motivated. See exactly how consistent you are.",
    tint: "#a855f7",
  },
  {
    icon: "crosshair",
    title: "Exam Mode",
    body:
      "Pick your exam date and subjects. Topter suspends non-exam topics and surfaces high-priority revision automatically.",
    tint: "#f59e0b",
  },
  {
    icon: "shield",
    title: "Daily Cap & Catch-up",
    body:
      "A daily topic cap prevents overwhelm. After a break, Catch-up Mode reschedules your backlog across a few days.",
    tint: "#10b981",
  },
];

/* ── Step cards ──────────────────────────────────────────────────────────── */

interface Step {
  num: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    num: "01",
    title: "Add your subjects",
    body: "Create subjects like Physics or History, then add topics under each one.",
  },
  {
    num: "02",
    title: "Study with Focus",
    body: "Tap any topic to start a timed session. Log difficulty so Topter knows what to prioritise.",
  },
  {
    num: "03",
    title: "Revise on schedule",
    body: "Topter queues topics based on spaced repetition. Open the app daily and follow the plan.",
  },
  {
    num: "04",
    title: "Track your Pulse",
    body: "Check streaks, weekly hours, and session history to stay accountable.",
  },
];

/* ── Sub-components ──────────────────────────────────────────────────────── */

function SectionTitle({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{text}</Text>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const colors = useColors();
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.card }]}>
      <View style={[styles.featureIconWrap, { backgroundColor: f.tint + "18" }]}>
        <Feather name={f.icon} size={20} color={f.tint} />
      </View>
      <Text style={[styles.featureTitle, { color: colors.foreground }]}>{f.title}</Text>
      <Text style={[styles.featureBody, { color: colors.mutedForeground }]}>{f.body}</Text>
    </View>
  );
}

function StepCard({ s }: { s: Step }) {
  const colors = useColors();
  return (
    <View style={styles.stepRow}>
      <Text style={[styles.stepNum, { color: colors.primary }]}>{s.num}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>{s.title}</Text>
        <Text style={[styles.stepBody, { color: colors.mutedForeground }]}>{s.body}</Text>
      </View>
    </View>
  );
}

function ProBenefit({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.proRow}>
      <Feather name={icon} size={18} color={colors.primary} />
      <Text style={[styles.proText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export default function AboutTopterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const handleGetStarted = async () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await AsyncStorage.setItem("tenx.hasSeenAbout", "1");
    router.replace("/home");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: topPad + 24,
          paddingBottom: bottomPad + 24,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <Text style={[styles.heroHeadline, { color: colors.foreground }]}>
            Welcome to{" "}
            <Text style={{ color: colors.primary }}>Topter</Text>
          </Text>
          <Text style={[styles.heroTagline, { color: colors.mutedForeground }]}>
            The daily revision companion for serious students.
          </Text>
        </View>

        {/* ── What is Topter ───────────────────────────────────────────── */}
        <View style={styles.bubble}>
          <Text style={[styles.bubbleText, { color: colors.foreground }]}>
            Topter is a daily revision companion built for serious students preparing for
            UPSC, NEET, JEE, SSC, Banking, and every other competitive exam. It replaces
            messy notebooks with an intelligent system that tells you exactly what to study
            today, tracks every minute of deep focus, and keeps you consistent through
            exam season and breaks — so you never lose track of what you have already learned.
          </Text>
        </View>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <SectionTitle text="What you get" />
        <View style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} f={f} />
          ))}
        </View>

        {/* ── Why you need this ────────────────────────────────────────── */}
        <SectionTitle text="Why every serious student needs Topter" />
        <View style={[styles.bubble, { gap: 10 }]}>
          <Text style={[styles.bulletText, { color: colors.foreground }]}>
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              Spaced repetition works only with consistency.
            </Text>{" "}
            Without daily review, 70% of what you study fades within a week. Topter auto-schedules every revision so you retain more with less effort.
          </Text>
          <Text style={[styles.bulletText, { color: colors.foreground }]}>
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              One glance tells your entire backlog.
            </Text>{" "}
            Stop guessing which chapter is urgent. Overdue, due, and fresh topics are queued automatically — just open the app and follow the plan.
          </Text>
          <Text style={[styles.bulletText, { color: colors.foreground }]}>
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              Exam mode changes everything.
            </Text>{" "}
            Enter your exam date and subjects. Non-exam topics pause. High-priority ones surface first. Your revision finally matches your countdown.
          </Text>
          <Text style={[styles.bulletText, { color: colors.foreground }]}>
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              Breaks are handled gracefully.
            </Text>{" "}
            Vacation mode shifts all schedules forward. Catch-up mode spreads backlog across days so you do not drown after a break.
          </Text>
          <Text style={[styles.bulletText, { color: colors.foreground }]}>
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              Track every minute of effort.
            </Text>{" "}
            Streaks, weekly hours, and session history keep you accountable. You will see exactly how daily effort adds up over months.
          </Text>
        </View>

        {/* ── How to use ─────────────────────────────────────────────────── */}
        <SectionTitle text="How to use Topter" />
        <View style={[styles.bubble, { gap: 16 }]}>
          {STEPS.map((s) => (
            <StepCard key={s.num} s={s} />
          ))}
        </View>

        {/* ── Pro plan ───────────────────────────────────────────────────── */}
        <SectionTitle text="Go Pro for the edge" />
        <View style={[styles.bubble, { gap: 14 }]}>
          <Text style={[styles.bubbleText, { color: colors.foreground }]}>
            The free plan covers everything a student needs to revise daily. Pro unlocks
            the tools that separate toppers from the rest:
          </Text>
          <ProBenefit icon="layers" text="Unlimited subjects & topics" />
          <ProBenefit icon="bar-chart-2" text="Advanced analytics & exportable reports" />
          <ProBenefit icon="zap" text="Custom daily caps & focus presets" />
          <ProBenefit icon="cloud" text="Cloud backup & cross-device sync" />
          <ProBenefit icon="bell-off" text="Remove ads for distraction-free sessions" />
          <View style={{ height: 4 }} />
          <Text style={[styles.bubbleText, { color: colors.mutedForeground, fontSize: 13 }]}>
            Pro is priced for students — less than a notebook per month.
          </Text>
        </View>

        {/* ── Built by ───────────────────────────────────────────────────── */}
        <SectionTitle text="Built by" />
        <View style={styles.bubble}>
          <Text style={[styles.bubbleText, { color: colors.foreground }]}>
            Topter is built by the Topter Team — a group of engineers and doctors dedicated to helping students study smarter, not harder.
          </Text>
        </View>

        {/* ── Spacer for sticky CTA ──────────────────────────────────────── */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Sticky CTA ─────────────────────────────────────────────────── */}
      <View
        style={[
          styles.ctaBar,
          {
            paddingBottom: bottomPad + 16,
            backgroundColor: colors.background + "F2",
            borderTopColor: colors.border,
          },
        ]}
      >
        <PrimaryButton title="Start Smart Study" onPress={handleGetStarted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  heroHeadline: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -1,
    textAlign: "center",
  },
  heroTagline: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },

  bubble: {
    backgroundColor: "rgba(120,120,120,0.06)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 28,
  },
  bubbleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 22,
  },
  bulletText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 22,
  },

  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.6,
    marginBottom: 14,
  },

  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  featureCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: -0.3,
  },
  featureBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },

  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  stepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    width: 28,
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: -0.3,
  },
  stepBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },

  proRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  proText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },

  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
