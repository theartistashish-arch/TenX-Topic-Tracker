import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
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

import { PrimaryButton } from "@/components/PrimaryButton";
import { EXAM_GOALS, ExamGoal, useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { buildStreak } from "@/lib/streak";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, isLoading, updateProfile, logout } = useAuth();
  const { topics } = useTopics();
  const { settings } = useSettings();

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name ?? "");
  const [city, setCity] = useState(currentUser?.city ?? "");
  const [school, setSchool] = useState(currentUser?.schoolName ?? "");
  const [examGoal, setExamGoal] = useState<ExamGoal>(
    currentUser?.examGoal ?? "Other",
  );
  const [customExamGoal, setCustomExamGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const totalMin = topics.reduce(
      (acc, t) => acc + (t.totalMinutesStudied || 0),
      0,
    );
    const sessions = topics.reduce(
      (acc, t) => acc + (t.sessions?.length ?? 0),
      0,
    );
    const streak = buildStreak(topics);
    const weekStart = startOfWeekMs(Date.now());
    const weekMin = topics.reduce((acc, t) => {
      for (const s of t.sessions ?? []) {
        if (s.startedAt >= weekStart) acc += s.minutes;
      }
      return acc;
    }, 0);
    return { totalMin, sessions, streak, topicCount: topics.length, weekMin };
  }, [topics]);

  const initials = useMemo(() => {
    const n = currentUser?.name?.trim() || currentUser?.email || "?";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
  }, [currentUser]);

  const memberSince = currentUser?.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "—";

  if (isLoading) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Text
          style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}
        >
          Sign in to view profile.
        </Text>
      </View>
    );
  }

  const startEdit = () => {
    setName(currentUser.name);
    setCity(currentUser.city);
    setSchool(currentUser.schoolName);
    const knownGoal = EXAM_GOALS.includes(currentUser.examGoal);
    setExamGoal(knownGoal ? currentUser.examGoal : "Other");
    setCustomExamGoal(knownGoal ? "" : currentUser.examGoal);
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateProfile({
      ...(name.trim() ? { name: name.trim() } : {}),
      city,
      schoolName: school,
      examGoal: examGoal === "Other" ? customExamGoal.trim() || "Other" : examGoal,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    setEditing(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: topInset + 6,
          paddingBottom: bottomInset + 28,
          paddingHorizontal: 18,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomInset + 28}
      >
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[
              styles.iconBtn,
              { borderColor: colors.border, backgroundColor: colors.card },
            ]}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Profile
          </Text>
          {editing ? (
            <Pressable onPress={() => setEditing(false)} hitSlop={10}>
              <Text style={[styles.linkBtn, { color: colors.mutedForeground }]}>
                Cancel
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={startEdit} hitSlop={10}>
              <Text style={[styles.linkBtn, { color: colors.primary }]}>
                Edit
              </Text>
            </Pressable>
          )}
        </View>

        <LinearGradient
          colors={["#4f46e5", "#22d3ee"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>
              {currentUser.name || "—"}
            </Text>
            <Text style={styles.heroEmail} numberOfLines={1}>
              {currentUser.email}
            </Text>
            <View style={styles.heroChips}>
              <HeroChip icon="target" label={currentUser.examGoal} />
              <HeroChip icon="calendar" label={`Since ${memberSince}`} />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <StatCard
            label="Streak"
            value={`${stats.streak}`}
            suffix="d"
            tint="#f59e0b"
          />
          <StatCard
            label="This week"
            value={`${Math.round((stats.weekMin / 60) * 10) / 10}`}
            suffix="h"
            tint="#22d3ee"
          />
          <StatCard
            label="Topics"
            value={`${stats.topicCount}`}
            suffix=""
            tint={colors.primary}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            label="Sessions"
            value={`${stats.sessions}`}
            suffix=""
            tint="#10b981"
          />
          <StatCard
            label="Total"
            value={`${Math.round((stats.totalMin / 60) * 10) / 10}`}
            suffix="h"
            tint="#a78bfa"
          />
          <StatCard
            label="Daily target"
            value={`${settings.dailyBudgetMin}`}
            suffix="m"
            tint="#f43f5e"
          />
        </View>

        {!editing ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <CardTitle title="About you" />
            <InfoRow
              icon="user"
              label="Full name"
              value={currentUser.name || "—"}
            />
            <InfoRow icon="mail" label="Email" value={currentUser.email} />
            <InfoRow
              icon="map-pin"
              label="City"
              value={currentUser.city || "—"}
            />
            <InfoRow
              icon="book"
              label="School / College"
              value={currentUser.schoolName || "—"}
            />
            <InfoRow
              icon="target"
              label="Exam goal"
              value={currentUser.examGoal}
              last
            />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <CardTitle title="Edit profile" />
            <FieldBlock label="Full name">
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Your name"
              />
            </FieldBlock>
            <FieldBlock label="City">
              <Input
                value={city}
                onChangeText={setCity}
                placeholder="Your city"
              />
            </FieldBlock>
            <FieldBlock label="School / College">
              <Input
                value={school}
                onChangeText={setSchool}
                placeholder="Where you study"
              />
            </FieldBlock>
            <FieldBlock label="Exam goal">
              <View style={styles.goalRow}>
                {EXAM_GOALS.map((g) => {
                  const active = examGoal === g;
                  return (
                    <Pressable
                      key={g}
                      onPress={() => setExamGoal(g)}
                      style={[
                        styles.goalChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active
                            ? `${colors.primary}1a`
                            : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.goalChipText,
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
              {examGoal === "Other" ? (
                <Input
                  value={customExamGoal}
                  onChangeText={setCustomExamGoal}
                  placeholder="e.g. NDA, CLAT, Bank PO"
                  style={{ marginTop: 12 }}
                />
              ) : null}
            </FieldBlock>
            {error ? (
              <Text style={[styles.error, { color: colors.destructive }]}>
                {error}
              </Text>
            ) : null}
            <PrimaryButton
              title="Save changes"
              onPress={handleSave}
              loading={saving}
            />
          </View>
        )}

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <CardTitle title="Account" />
          <ActionRow
            icon="settings"
            label="App settings"
            onPress={() => router.push("/settings")}
          />
          <ActionRow
            icon="log-out"
            label="Log out"
            onPress={handleLogout}
            danger
            last
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function startOfWeekMs(now: number): number {
  const d = new Date(now);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function HeroChip({
  icon,
  label,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.heroChip}>
      <Feather name={icon} size={11} color="#fff" />
      <Text style={styles.heroChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  suffix,
  tint,
}: {
  label: string;
  value: string;
  suffix: string;
  tint: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: colors.foreground }]}>
          {value}
        </Text>
        <Text style={[styles.statSuffix, { color: tint }]}>{suffix}</Text>
      </View>
    </View>
  );
}

function CardTitle({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.cardTitle, { color: colors.foreground }]}>
      {title}
    </Text>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.infoRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View
        style={[styles.infoIcon, { backgroundColor: `${colors.primary}14` }]}
      >
        <Feather name={icon} size={14} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Text
          style={[styles.infoValue, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.mutedForeground}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          color: colors.foreground,
        },
        props.style,
      ]}
    />
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  const tint = danger ? colors.destructive : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        !last && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.infoIcon, { backgroundColor: `${tint}14` }]}>
        <Feather name={icon} size={14} color={tint} />
      </View>
      <Text
        style={[
          styles.actionLabel,
          { color: danger ? colors.destructive : colors.foreground },
        ]}
      >
        {label}
      </Text>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  linkBtn: { fontFamily: "Inter_700Bold", fontSize: 14 },
  heroCard: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderRadius: 22,
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 24 },
  heroName: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 18 },
  heroEmail: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
  heroChips: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  heroChipText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, gap: 4 },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.4,
  },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  statSuffix: { fontFamily: "Inter_700Bold", fontSize: 13 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 0.3 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 1 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  goalRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  goalChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  goalChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  actionLabel: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
