import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import {
  FREE_SUBJECT_LIMIT,
  FREE_TOPIC_LIMIT,
  useTopics,
} from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { useAds } from "@/lib/ads";

const LAST_SUBJECT_KEY = "tenx.lastSubject";

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

  // ── Limit modal state ─────────────────────────────────────────────────────
  const [limitModal, setLimitModal] = useState<"subject_limit" | "topic_limit" | null>(null);
  const [watchingAd, setWatchingAd] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);

  // ── Subject combobox state ────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const topicInputRef = useRef<TextInput>(null);

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
    (s) => s.toLowerCase() === subject.trim().toLowerCase(),
  );

  const selectSubject = (val: string) => {
    setSubject(val);
    setDropdownOpen(false);
    setTimeout(() => topicInputRef.current?.focus(), 100);
  };

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  // ── Shared topic creation helper ──────────────────────────────────────────
  const createAndNavigate = async (bypassGate: boolean) => {
    setSubmitting(true);
    const created = await addTopic({ subject, topicName, bypassGate });
    setSubmitting(false);
    if (!created) {
      setError("Could not save topic. Try again.");
      return false;
    }
    void AsyncStorage.setItem(LAST_SUBJECT_KEY, subject.trim());
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    router.replace({ pathname: "/pre-focus", params: { topicId: created.id } });
    return true;
  };

  // ── START STUDYING handler ────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null);
    if (!subject.trim() || !topicName.trim()) {
      setError("Please fill in both subject and topic name.");
      return;
    }

    const gate = checkAddTopicGate(subject);

    if (!gate.allowed) {
      if (bonusTopicsRemaining > 0) {
        // Daily bonus slot available — bypass gate and proceed immediately.
        const ok = await createAndNavigate(true);
        if (ok) await consumeBonusTopic();
        return;
      }
      // No bonus — show the contextual limit modal.
      setAdError(null);
      setLimitModal(gate.reason);
      return;
    }

    await createAndNavigate(false);
  };

  // ── Watch ad → grant bonus → create topic → navigate (one tap flow) ───────
  const handleWatchAdAndProceed = async () => {
    setAdError(null);
    setWatchingAd(true);
    const earned = await showRewardedAd();
    setWatchingAd(false);

    if (!earned) {
      setAdError("Ad not completed. Watch the full ad to unlock a slot.");
      return;
    }

    await grantBonusTopic();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setLimitModal(null);
    const ok = await createAndNavigate(true);
    if (ok) await consumeBonusTopic();
  };

  const handleUpgradeToPro = () => {
    setLimitModal(null);
    router.push("/paywall");
  };

  const handleClose = () => router.back();

  // ── Limit modal copy ──────────────────────────────────────────────────────
  const modalTitle =
    limitModal === "subject_limit" ? "Subject Limit Reached" : "Topic Limit Reached";
  const modalSubtitle =
    limitModal === "subject_limit"
      ? `You've used all ${FREE_SUBJECT_LIMIT} free subject slots`
      : `You've used all ${FREE_TOPIC_LIMIT} free topic slots for this subject`;

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
          {/* ── Subject combobox ──────────────────────────────────────────── */}
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

      {/* ── Limit modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={limitModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLimitModal(null)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Close button */}
            <Pressable
              onPress={() => setLimitModal(null)}
              style={({ pressed }) => [styles.modalClose, { opacity: pressed ? 0.6 : 1 }]}
              hitSlop={8}
            >
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>

            {/* Icon */}
            <View style={[styles.modalIconWrap, { backgroundColor: "#f59e0b18" }]}>
              <Feather name="lock" size={26} color="#f59e0b" />
            </View>

            {/* Copy */}
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {modalTitle}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              {modalSubtitle}
            </Text>

            {/* Ad error */}
            {adError ? (
              <Text style={[styles.adErrorText, { color: colors.destructive }]}>
                {adError}
              </Text>
            ) : null}

            {/* Watch Ad button */}
            <Pressable
              onPress={handleWatchAdAndProceed}
              disabled={watchingAd}
              style={({ pressed }) => [
                styles.modalPrimaryBtn,
                { backgroundColor: colors.primary, opacity: watchingAd || pressed ? 0.75 : 1 },
              ]}
            >
              {watchingAd ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="play-circle" size={18} color="#fff" />
              )}
              <Text style={styles.modalPrimaryBtnText}>
                {watchingAd ? "Loading ad…" : "Watch Ad"}
              </Text>
            </Pressable>

            {/* Upgrade to Pro button */}
            <Pressable
              onPress={handleUpgradeToPro}
              style={({ pressed }) => [
                styles.modalSecondaryBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="star" size={16} color={colors.foreground} />
              <Text style={[styles.modalSecondaryBtnText, { color: colors.foreground }]}>
                Upgrade to Pro
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  modalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 4,
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  modalSubtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  adErrorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
  },
  modalPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 50,
    borderRadius: 14,
    marginTop: 8,
  },
  modalPrimaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
    letterSpacing: 0.2,
  },
  modalSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  modalSecondaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
