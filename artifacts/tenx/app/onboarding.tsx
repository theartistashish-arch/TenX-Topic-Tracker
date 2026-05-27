import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function LibraryPreviewCard() {
  const subjects = [
    { label: "Physics", color: "#4f46e5", topics: ["Kinematics", "Optics"] },
    { label: "Chemistry", color: "#22d3ee", topics: ["Mole Concept", "Redox"] },
  ];
  return (
    <View style={previewStyles.card}>
      <Text style={previewStyles.cardHeader}>My Library</Text>
      {subjects.map((s) => (
        <View key={s.label} style={previewStyles.subjectGroup}>
          <View style={previewStyles.subjectRow}>
            <View style={[previewStyles.subjectDot, { backgroundColor: s.color }]} />
            <Text style={previewStyles.subjectLabel}>{s.label}</Text>
          </View>
          {s.topics.map((t) => (
            <View key={t} style={previewStyles.topicRow}>
              <View style={previewStyles.topicBullet} />
              <Text style={previewStyles.topicLabel}>{t}</Text>
              <View style={previewStyles.topicPill} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function FocusPreviewCard() {
  return (
    <LinearGradient
      colors={["#1e1b4b", "#312e81"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={previewStyles.focusCard}
    >
      <Text style={previewStyles.focusLabel}>Focusing</Text>
      <Text style={previewStyles.focusTimer}>00:23</Text>
      <View style={previewStyles.progressTrack}>
        <View style={previewStyles.progressFill} />
      </View>
      <Text style={previewStyles.focusTopic}>Electrostatics · Chapter 2</Text>
    </LinearGradient>
  );
}

function PulsePreviewCard() {
  const bars = [0.45, 0.7, 0.55, 0.85, 0.6];
  const labels = ["M", "T", "W", "T", "F"];
  return (
    <View style={previewStyles.card}>
      <View style={previewStyles.pulseHeader}>
        <Text style={previewStyles.cardHeader}>Pulse</Text>
        <View style={previewStyles.streakChip}>
          <Text style={previewStyles.streakText}>🔥 7d streak</Text>
        </View>
      </View>
      <View style={previewStyles.barChart}>
        {bars.map((h, i) => (
          <View key={i} style={previewStyles.barWrapper}>
            <LinearGradient
              colors={["#4f46e5", "#22d3ee"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[previewStyles.bar, { height: h * 56 }]}
            />
            <Text style={previewStyles.barLabel}>{labels[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnimatedDot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 20 : 6);
  const opacity = useSharedValue(active ? 1 : 0.35);

  useEffect(() => {
    width.value = withTiming(active ? 20 : 6, { duration: 250 });
    opacity.value = withTiming(active ? 1 : 0.35, { duration: 250 });
  }, [active]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    opacity: opacity.value,
  }));

  return <Animated.View style={[dotStyles.dot, style]} />;
}

function DotIndicator({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <AnimatedDot key={i} active={i === activeIndex} />
      ))}
    </View>
  );
}

interface OnboardingSlideProps {
  headline: string;
  tagline: string;
  card: React.ReactNode;
  topPad: number;
  screenWidth: number;
}

function OnboardingSlide({ headline, tagline, card, topPad, screenWidth }: OnboardingSlideProps) {
  const colors = useColors();
  return (
    <View style={[slideStyles.slide, { width: screenWidth, paddingTop: topPad + 56 }]}>
      <View style={slideStyles.cardWrapper}>{card}</View>
      <View style={slideStyles.textBlock}>
        <Text style={[slideStyles.headline, { color: colors.foreground }]}>{headline}</Text>
        <Text style={[slideStyles.tagline, { color: colors.mutedForeground }]}>{tagline}</Text>
      </View>
    </View>
  );
}

const SLIDES = [
  {
    headline: "Revise smarter",
    tagline: "Organised topics, zero friction.",
    card: <LibraryPreviewCard />,
  },
  {
    headline: "Stay in the zone",
    tagline: "Deep work sessions, tracked for you.",
    card: <FocusPreviewCard />,
  },
  {
    headline: "Know your rank",
    tagline: "Real-time progress you can actually feel.",
    card: <PulsePreviewCard />,
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = isWeb ? Math.max(insets.bottom, 24) : Math.max(insets.bottom, 24);

  useEffect(() => {
    AsyncStorage.setItem("tenx.onboarded", "1").catch(() => {});
  }, []);

  const markOnboarded = async () => {
    try {
      await AsyncStorage.setItem("tenx.onboarded", "1");
    } catch (e) {
      if (__DEV__) console.warn("[onboarding] failed to persist onboarded flag", e);
    }
  };

  const handleGetStarted = async () => {
    await markOnboarded();
    router.replace("/signup");
  };

  const handleSkip = async () => {
    await markOnboarded();
    router.replace("/signup");
  };

  const handleSignIn = async () => {
    await markOnboarded();
    router.replace("/login");
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setActiveIndex(page);
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {!isLast && (
        <Pressable
          style={[styles.skipBtn, { top: topPad + 12 }]}
          onPress={handleSkip}
        >
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip</Text>
        </Pressable>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scroller}
      >
        {SLIDES.map((slide, i) => (
          <OnboardingSlide
            key={i}
            headline={slide.headline}
            tagline={slide.tagline}
            card={slide.card}
            topPad={topPad}
            screenWidth={screenWidth}
          />
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: bottomPad + 16 }]}>
        <DotIndicator count={SLIDES.length} activeIndex={activeIndex} />

        {isLast ? (
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleGetStarted}
          >
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              Get started
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => {
              const next = Math.min(activeIndex + 1, SLIDES.length - 1);
              scrollRef.current?.scrollTo({ x: screenWidth * next, animated: true });
              setActiveIndex(next);
            }}
          >
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              Next
            </Text>
          </Pressable>
        )}

        <Pressable style={styles.loginLink} onPress={handleSignIn}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>
            I have an account{" "}
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
              Sign in
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const slideStyles = StyleSheet.create({
  slide: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 32,
  },
  cardWrapper: {
    width: "100%",
    alignItems: "center",
  },
  textBlock: {
    width: "100%",
    gap: 8,
  },
  headline: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    letterSpacing: -1.2,
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    fontSize: 17,
    lineHeight: 24,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  skipBtn: {
    position: "absolute",
    right: 24,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  scroller: { flex: 1 },
  bottom: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
    alignItems: "center",
  },
  ctaBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  ctaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: -0.3,
  },
  loginLink: {
    paddingVertical: 4,
  },
  loginText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
});

const previewStyles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#0b1020",
    letterSpacing: -0.3,
  },
  subjectGroup: {
    gap: 6,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subjectLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#0b1020",
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
  },
  topicBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
  },
  topicLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#6b7280",
    flex: 1,
  },
  topicPill: {
    width: 36,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#eef0ff",
  },
  focusCard: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
    shadowColor: "#4f46e5",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  focusLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#a5b4fc",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  focusTimer: {
    fontFamily: "Inter_700Bold",
    fontSize: 48,
    color: "#ffffff",
    letterSpacing: -2,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressFill: {
    width: "35%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22d3ee",
  },
  focusTopic: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
  },
  pulseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  streakChip: {
    backgroundColor: "#fff7ed",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  streakText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#c2410c",
  },
  barChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    height: 72,
    paddingTop: 8,
  },
  barWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  bar: {
    width: "100%",
    borderRadius: 6,
  },
  barLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#9ca3af",
  },
});

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4f46e5",
  },
});
