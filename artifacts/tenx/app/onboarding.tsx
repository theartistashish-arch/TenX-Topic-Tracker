import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { EXAM_GOALS, ExamGoal, useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const TOTAL_STEPS = 3;

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, updateProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [name, setName] = useState(currentUser?.name ?? "");
  const [examGoal, setExamGoal] = useState<ExamGoal>(currentUser?.examGoal ?? "Other");
  const [customGoal, setCustomGoal] = useState("");
  const [school, setSchool] = useState(currentUser?.schoolName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const handleNext = () => {
    setError(null);
    if (step === 1 && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (step === 2 && examGoal === "Other" && !customGoal.trim()) {
      setError("Please enter your exam goal.");
      return;
    }
    setStep((s) => s + 1);
  };

  const handleFinish = async () => {
    setError(null);
    setSaving(true);
    try {
      const finalGoal =
        examGoal === "Other" ? customGoal.trim() || "Other" : examGoal;
      await updateProfile({
        name: name.trim(),
        schoolName: school.trim(),
        examGoal: finalGoal,
      });
      await AsyncStorage.setItem("tenx.onboarded", "1");
      router.replace("/(tabs)/home");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Progress segments */}
      <View style={[styles.progressRow, { paddingTop: topPad + 20 }]}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSegment,
              { backgroundColor: i < step ? colors.primary : colors.border },
            ]}
          />
        ))}
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomPad + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomPad + 32}
      >
        {/* Step 1 — Name */}
        {step === 1 && (
          <StepShell
            headline="What's your name?"
            sub="We'll use this to personalise your experience."
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoCapitalize="words"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleNext}
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
            />
          </StepShell>
        )}

        {/* Step 2 — Exam goal */}
        {step === 2 && (
          <StepShell
            headline="What are you preparing for?"
            sub="Choose the exam you're targeting right now."
          >
            <View style={styles.chipGrid}>
              {EXAM_GOALS.map((g) => {
                const active = examGoal === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => {
                      setExamGoal(g);
                      setError(null);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active
                          ? `${colors.primary}18`
                          : colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: active ? colors.primary : colors.foreground,
                        },
                      ]}
                    >
                      {g}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {examGoal === "Other" && (
              <TextInput
                value={customGoal}
                onChangeText={setCustomGoal}
                placeholder="e.g. NDA, CLAT, Bank PO"
                autoCapitalize="words"
                returnKeyType="done"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                    marginTop: 14,
                  },
                ]}
              />
            )}
          </StepShell>
        )}

        {/* Step 3 — School / College */}
        {step === 3 && (
          <StepShell
            headline="Where do you study?"
            sub="Enter your school or college name."
          >
            <TextInput
              value={school}
              onChangeText={setSchool}
              placeholder="School or college name"
              autoCapitalize="words"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleFinish}
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
            />
          </StepShell>
        )}

        {error ? (
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {step < TOTAL_STEPS ? (
            <PrimaryButton title="Next" onPress={handleNext} />
          ) : (
            <PrimaryButton
              title="Let's go"
              onPress={handleFinish}
              loading={saving}
            />
          )}
          {step > 1 && (
            <Pressable
              onPress={() => {
                setError(null);
                setStep((s) => s - 1);
              }}
              style={({ pressed }) => ({
                alignSelf: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={[styles.backText, { color: colors.mutedForeground }]}
              >
                Back
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function StepShell({
  headline,
  sub,
  children,
}: {
  headline: string;
  sub: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.stepShell}>
      <View style={styles.textBlock}>
        <Text style={[styles.headline, { color: colors.foreground }]}>
          {headline}
        </Text>
        <Text style={[styles.subText, { color: colors.mutedForeground }]}>
          {sub}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 36,
    gap: 28,
    flexGrow: 1,
  },
  stepShell: {
    gap: 24,
  },
  textBlock: {
    gap: 8,
  },
  headline: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    letterSpacing: -1,
  },
  subText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  actions: {
    gap: 12,
    paddingTop: 8,
  },
  backText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
