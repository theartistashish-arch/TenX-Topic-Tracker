import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useSettings } from "@/contexts/SettingsContext";
import { useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";

export default function PreFocusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const { getTopic } = useTopics();
  const { settings, isLoading: settingsLoading } = useSettings();

  const topic = useMemo(() => (topicId ? getTopic(topicId) : null), [topicId, getTopic]);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const handleStart = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    router.replace({ pathname: "/focus", params: { topicId: topicId! } });
  };

  const handleBack = () => router.back();

  if (!topic || settingsLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          { paddingTop: topInset + 20, paddingBottom: bottomInset + 28 },
        ]}
      >
        {/* Top close */}
        <Pressable onPress={handleBack} style={styles.closeBtn}>
          <Feather name="x" size={24} color={colors.mutedForeground} />
        </Pressable>

        {/* Illustration area */}
        <View style={styles.illustration}>
          <View style={[styles.illustrationRing, { borderColor: colors.primary }]}>
            <Feather name="target" size={40} color={colors.primary} />
          </View>
        </View>

        {/* Headline */}
        <View style={styles.textBlock}>
          <Text style={[styles.subjectLabel, { color: colors.mutedForeground }]}>
            {topic.subject}
          </Text>
          <Text style={[styles.topicName, { color: colors.foreground }]}>
            {topic.topicName}
          </Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Expectation copy */}
        <View style={styles.expectationBlock}>
          <Text style={[styles.readyLine, { color: colors.foreground }]}>
            Ready to focus?
          </Text>
          <Text style={[styles.subLine, { color: colors.mutedForeground }]}>
            Your focus session is about to start.{"\n"}
            Goal: {settings.focusMinutes} min
          </Text>
        </View>

        {/* CTA */}
        <View style={styles.ctaBlock}>
          <PrimaryButton
            title="Start Focus Session"
            onPress={handleStart}
          />
          <Pressable onPress={handleBack} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
              I’ll start later
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    gap: 16,
  },
  closeBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  illustration: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 8,
  },
  illustrationRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
  },
  textBlock: {
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  subjectLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  topicName: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 40,
    marginTop: 8,
    marginBottom: 8,
  },
  expectationBlock: {
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  readyLine: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  subLine: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  ctaBlock: {
    marginTop: "auto",
    gap: 14,
    paddingBottom: 12,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});
