import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { useAds } from "@/lib/ads";

const LAST_SUBJECT_KEY = "tenx.lastSubject";

/** Generate a soft pastel colour from a string seed. */
function stringToColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `hsl(${h}, 72%, 42%)`;
}

function initials(str: string): string {
  const parts = str.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function NewTopicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addTopic, checkAddTopicGate, topics } = useTopics();
  const { showRewardedAd, bonusTopicsRemaining, grantBonusTopic, consumeBonusTopic } = useAds();

  const [subject, setSubject] = useState("");
  const [topicName, setTopicName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);

  // ── Subject combobox state ────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const topicInputRef = useRef<TextInput>(null);

  // Pre-fill subject from last used
  useEffect(() => {
    void (async () => {
      try {
        const last = await AsyncStorage.getItem(LAST_SUBJECT_KEY);
        if (last) setSubject(last);
      } catch { /* ignore */ }
    })();
  }, []);

  const existingSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const t of topics) if (t.subject) set.add(t.subject.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [topics]);

  const filteredSubjects = useMemo(() => {
    const q = subject.trim().toLowerCase();
    if (!q) return existingSubjects;
    return existingSubjects.filter((s) => s.toLowerCase().includes(q));
  }, [existingSubjects, subject]);

  const showCreateNew = subject.trim().length > 0 && !existingSubjects.some(
    (s) => s.toLowerCase() === subject.trim().toLowerCase()
  );

  const selectSubject = (val: string) => {
    setSubject(val);
    setDropdownOpen(false);
    setTimeout(() => topicInputRef.current?.focus(), 100);
  };

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const handleSave = async () => {
    setError(null);
    if (!subject.trim() || !topicName.trim()) {
      setError("Please fill in both subject and topic name.");
      return;
    }

    const gate = checkAddTopicGate(subject);

    if (!gate.allowed) {
      // If a daily bonus slot is available, use it to bypass whichever cap was hit
      if (bonusTopicsRemaining > 0) {
        setSubmitting(true);
        const created = await addTopic({ subject, topicName, bypassGate: true });
        if (created) await consumeBonusTopic();
        setSubmitting(false);
        if (!created) {
          setError("Could not save topic. Try again.");
          return;
        }
        void AsyncStorage.setItem(LAST_SUBJECT_KEY, subject.trim());
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        router.replace({ pathname: "/pre-focus", params: { topicId: created.id } });
        return;
      }
      // No bonus — gate banner + rewarded ad button guide the user
      return;
    }

    setSubmitting(true);
    const created = await addTopic({ subject, topicName });
    setSubmitting(false);
    if (!created) {
      setError("Could not save topic. Try again.");
      return;
    }
    void AsyncStorage.setItem(LAST_SUBJECT_KEY, subject.trim());
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    router.replace({ pathname: "/pre-focus", params: { topicId: created.id } });
  };

  const handleWatchAd = async () => {
    setError(null);
    setWatchingAd(true);
    const earned = await showRewardedAd();
    setWatchingAd(false);
    if (earned) {
      await grantBonusTopic();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } else {
      if (Platform.OS !== "web") {
        setError("Ad not completed. Watch the full ad to unlock a bonus topic.");
      }
    }
  };

  const handleClose = () => router.back();

  const liveGate = subject.trim() ? checkAddTopicGate(subject) : null;
  const bonusActive = bonusTopicsRemaining > 0;
  // Show rewarded ad button for both topic_limit and subject_limit — the bonus
  // slot bypasses whichever cap was hit (one extra creation per rewarded ad per day).
  const showRewardedAdButton = liveGate && !liveGate.allowed && !bonusActive;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 16, paddingBottom: bottomInset + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomInset + 24}
      >
        <View style={[styles.headerRow, { justifyContent: "center" }]}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            New session
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.foreground, textAlign: "center" }]}>
          Start a new topic
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Tell Topter what you're studying, then jump straight into the Focus
          Arena.
        </Text>

        <View style={styles.form}>
          {/* ── Subject combobox ──────────────────────────────────────────────── */}
          <View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Subject</Text>
            <View style={{ position: "relative" }}>
              <TextInput
                value={subject}
                onChangeText={(v) => {
                  setSubject(v);
                  if (!dropdownOpen) setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search or add subject"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                style={[
                  styles.comboInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              <Pressable
                onPress={() => {
                  if (subject) { setSubject(""); setDropdownOpen(true); }
                  else { setDropdownOpen((p) => !p); }
                }}
                style={styles.comboChevron}
              >
                <Feather
                  name={subject ? "x" : dropdownOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
            {dropdownOpen && (
              <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {filteredSubjects.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => selectSubject(s)}
                    style={({ pressed }) => [
                      styles.dropItem,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: stringToColor(s) + "22" }]}>
                      <Text style={[styles.avatarText, { color: stringToColor(s) }]}>{initials(s)}</Text>
                    </View>
                    <Text style={[styles.dropItemText, { color: colors.foreground }]}>{s}</Text>
                  </Pressable>
                ))}
                {showCreateNew && (
                  <Pressable
                    onPress={() => selectSubject(subject.trim())}
                    style={({ pressed }) => [
                      styles.dropItem,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: "#4f46e522" }]}>
                      <Text style={[styles.avatarText, { color: "#4f46e5" }]}>+</Text>
                    </View>
                    <Text style={[styles.dropItemText, { color: colors.primary }]}>
                      Create "{subject.trim()}" as new subject
                    </Text>
                  </Pressable>
                )}
                {filteredSubjects.length === 0 && !showCreateNew && (
                  <View style={styles.dropItem}>
                    <Text style={[styles.dropItemText, { color: colors.mutedForeground }]}>
                      Type to create a new subject
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <FormField
            label="Topic name"
            value={topicName}
            onChangeText={setTopicName}
            placeholder="Enter your topic name"
            autoCapitalize="sentences"
            ref={topicInputRef as never}
          />

          {liveGate && !liveGate.allowed ? (
            <Pressable
              onPress={bonusActive ? undefined : () => router.replace("/paywall")}
              style={[
                styles.gateBanner,
                bonusActive
                  ? { backgroundColor: "#22c55e18", borderColor: "#22c55e40" }
                  : { backgroundColor: "#4f46e518", borderColor: "#4f46e540" },
              ]}
            >
              <Feather
                name={bonusActive ? "unlock" : "lock"}
                size={13}
                color={bonusActive ? "#22c55e" : "#4f46e5"}
              />
              <Text
                style={[
                  styles.gateBannerText,
                  { color: bonusActive ? "#22c55e" : "#4f46e5" },
                ]}
              >
                {bonusActive
                  ? "Bonus unlocked! Tap START STUDYING to add one extra slot today."
                  : liveGate.reason === "subject_limit"
                    ? "Free plan: 2 subjects max. Tap to upgrade."
                    : "Free plan: 10 topics per subject. Tap to upgrade."}
              </Text>
              {!bonusActive && (
                <Feather name="chevron-right" size={13} color="#4f46e5" />
              )}
            </Pressable>
          ) : null}

          {showRewardedAdButton ? (
            <Pressable
              onPress={handleWatchAd}
              disabled={watchingAd}
              style={({ pressed }) => [
                styles.adBanner,
                { opacity: watchingAd ? 0.7 : pressed ? 0.85 : 1 },
              ]}
            >
              {watchingAd ? (
                <ActivityIndicator size="small" color="#f59e0b" />
              ) : (
                <Feather name="play-circle" size={16} color="#f59e0b" />
              )}
              <Text style={styles.adBannerText}>
                {watchingAd ? "Loading ad…" : "Watch a short ad to unlock 1 extra slot today"}
              </Text>
            </Pressable>
          ) : null}

          {error ? (
            <Text style={[styles.errorBanner, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            title="START STUDYING"
            onPress={handleSave}
            loading={submitting}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    gap: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  form: {
    gap: 16,
    marginTop: 8,
  },
  gateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  gateBannerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  adBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f59e0b40",
    backgroundColor: "#f59e0b14",
  },
  adBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
    color: "#f59e0b",
  },
  errorBanner: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  fieldLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  comboInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingRight: 42,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  comboChevron: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 6,
    overflow: "hidden",
  },
  dropItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
});
