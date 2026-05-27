import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import {
  BREAK_STEP_MIN,
  BUDGET_STEP_MIN,
  FOCUS_STEP_MIN,
  MAX_BREAK_MIN,
  MAX_BUDGET_MIN,
  MAX_FOCUS_MIN,
  MIN_BREAK_MIN,
  MIN_BUDGET_MIN,
  MIN_FOCUS_MIN,
  ThemePref,
  useSettings,
} from "@/contexts/SettingsContext";
import { requestRevisionPermission } from "@/lib/notifications";
import { useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/lib/revenuecat";

const APP_VERSION = "1.0.0";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout, currentUser, deleteAccount } = useAuth();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { clearAllTopics, topics, shiftAllDueDates } = useTopics();
  const { isPro } = useSubscription();
  const [busy, setBusy] = useState<string | null>(null);

  const isWeb = Platform.OS === "web";

  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const tap = () => {
    if (settings.hapticsEnabled && Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const confirm = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : true;
      if (ok) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: () => void onConfirm() },
    ]);
  };

  const handleResetSettings = () =>
    confirm("Reset settings", "Restore all preferences to defaults?", async () => {
      setBusy("reset-settings");
      await resetSettings();
      setBusy(null);
    });

  const handleClearTopics = () =>
    confirm("Delete all topics", `Permanently remove ${topics.length} topic${topics.length === 1 ? "" : "s"} and their study history. This cannot be undone.`, async () => {
      setBusy("clear-topics");
      await clearAllTopics();
      setBusy(null);
    });

  const handleDeleteAccount = () =>
    confirm("Delete account", "This will permanently delete your account, all topics, study history, and settings. This cannot be undone.", async () => {
      setBusy("delete-account");
      const res = await deleteAccount();
      setBusy(null);
      if (res.ok) {
        router.replace("/login");
      } else {
        Alert.alert("Could not delete account", res.error ?? "Please try again later.");
      }
    });

  const handleVacationToggle = async (v: boolean) => {
    tap();
    if (v) {
      void updateSettings({ vacationSince: Date.now() });
    } else {
      const since = settings.vacationSince;
      if (since !== null) {
        const pausedMs = Date.now() - since;
        await shiftAllDueDates(pausedMs);
      }
      void updateSettings({ vacationSince: null });
    }
  };

  const handleManageSubscription = () => {
    if (Platform.OS === "web") return;
    const url =
      Platform.OS === "android"
        ? "https://play.google.com/store/account/subscriptions"
        : "https://apps.apple.com/account/subscriptions";
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open subscription management", "Please visit your device's App Store or Play Store to manage your subscription.");
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + 6, paddingBottom: bottomInset + 32, paddingHorizontal: 18, gap: 16 }}
      >
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}> 
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        <Section title="Schedule">
          <Toggle
            icon="pause-circle"
            label="Pause Schedule"
            description="Freeze revision dates before a planned break. Dates shift forward on resume so nothing piles up."
            value={settings.vacationSince !== null}
            onChange={(v) => void handleVacationToggle(v)}
            last
          />
        </Section>

        <Section title="Study">
          <Stepper
            icon="clock"
            label="Daily target"
            value={settings.dailyBudgetMin}
            unit="min"
            step={BUDGET_STEP_MIN}
            min={MIN_BUDGET_MIN}
            max={MAX_BUDGET_MIN}
            onChange={(v) => { tap(); void updateSettings({ dailyBudgetMin: v }); }}
            hint="Self study time you can put in today."
          />
          <Stepper
            icon="zap"
            label="Focus block"
            value={settings.focusMinutes}
            unit="min"
            step={FOCUS_STEP_MIN}
            min={MIN_FOCUS_MIN}
            max={MAX_FOCUS_MIN}
            onChange={(v) => { tap(); void updateSettings({ focusMinutes: v }); }}
            hint="Default length for each focus session."
          />
          <Stepper
            icon="coffee"
            label="Break length"
            value={settings.breakMinutes}
            unit="min"
            step={BREAK_STEP_MIN}
            min={MIN_BREAK_MIN}
            max={MAX_BREAK_MIN}
            onChange={(v) => { tap(); void updateSettings({ breakMinutes: v }); }}
            hint="Time off between focus blocks."
          />
        </Section>

        <Section title="Feedback">
          <Toggle
            icon="smartphone"
            label="Haptics"
            description="Vibrate on taps and timer events."
            value={settings.hapticsEnabled}
            onChange={(v) => void updateSettings({ hapticsEnabled: v })}
          />
          <Toggle
            icon="volume-2"
            label="Sounds"
            description="Play a chime when a focus or break ends."
            value={settings.soundEnabled}
            onChange={(v) => { tap(); void updateSettings({ soundEnabled: v }); }}
            last
          />
        </Section>


        <Section title="Notifications">
          <Toggle
            icon="bell"
            label="Enable notifications"
            description="Revision reminders and streak alerts."
            value={settings.remindersEnabled}
            onChange={async (v) => {
              tap();
              if (v) {
                const granted = await requestRevisionPermission();
              }
              void updateSettings({ remindersEnabled: v });
            }}
          />
          <Toggle
            icon="sunrise"
            label="Morning reminder"
            description="Daily nudge at 8 AM when topics are due."
            value={settings.morningReminderEnabled}
            onChange={(v) => { tap(); void updateSettings({ morningReminderEnabled: v }); }}
            disabled={!settings.remindersEnabled}
          />
          <Toggle
            icon="sunset"
            label="Evening reminder"
            description="Evening check-in at 7 PM for pending topics."
            value={settings.eveningReminderEnabled}
            onChange={(v) => { tap(); void updateSettings({ eveningReminderEnabled: v }); }}
            disabled={!settings.remindersEnabled}
          />
          <Toggle
            icon="zap"
            label="Streak alerts"
            description="Warn you before a study streak is broken."
            value={settings.streakAlertsEnabled}
            onChange={(v) => { tap(); void updateSettings({ streakAlertsEnabled: v }); }}
            disabled={!settings.remindersEnabled}
          />
          <Toggle
            icon="trending-up"
            label="Motivational insights"
            description="Low-priority tips and retention observations."
            value={settings.motivationalInsightsEnabled}
            onChange={(v) => { tap(); void updateSettings({ motivationalInsightsEnabled: v }); }}
            disabled={!settings.remindersEnabled}
            last
          />
        </Section>

        <Section title="Account">
          <ActionRow
            icon="user"
            label="Edit profile"
            sub={currentUser?.email}
            onPress={() => { tap(); router.push("/profile"); }}
          />
          {isPro && !isWeb && (
            <ActionRow
              icon="credit-card"
              label="Manage Subscription"
              sub="View or cancel your Pro plan."
              onPress={() => { tap(); handleManageSubscription(); }}
            />
          )}
          <ActionRow
            icon="log-out"
            label="Log out"
            onPress={handleLogout}
            danger
          />
          <ActionRow
            icon="trash-2"
            label="Delete account"
            sub="Permanently remove your account and all data."
            onPress={handleDeleteAccount}
            loading={busy === "delete-account"}
            danger
            last
          />
        </Section>

        <Section title="Data">
          <ActionRow
            icon="rotate-ccw"
            label="Reset settings"
            sub="Restore all preferences to defaults."
            onPress={handleResetSettings}
            loading={busy === "reset-settings"}
          />
          <ActionRow
            icon="trash-2"
            label="Delete all topics"
            sub={`${topics.length} topic${topics.length === 1 ? "" : "s"} stored on this device.`}
            onPress={handleClearTopics}
            loading={busy === "clear-topics"}
            danger
            last
          />
        </Section>

        <Section title="App Mode">
          <View style={{ paddingVertical: 6 }}>
            <ThemeToggle
              value={settings.theme}
              onChange={(t) => { tap(); void updateSettings({ theme: t }); }}
            />
          </View>
        </Section>

        <Section title="About">
          <InfoLine label="Version" value={APP_VERSION} />
          <InfoLine label="Build" value="Topter · Aspirant" />
          <ActionRow
            icon="shield"
            label="Privacy Policy"
            sub="How we handle your data"
            onPress={() => {
              const url = "https://theartistashish-arch.github.io/topter-privacy";
              Linking.openURL(url).catch(() => {});
            }}
            last
          />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Stepper({
  icon,
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
  hint,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  hint?: string;
  last?: boolean;
}) {
  const colors = useColors();
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const display = unit === "min" && value >= 60 ? `${Math.round((value / 60) * 10) / 10} h` : `${value} ${unit}`;
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}> 
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}14` }]}> 
        <Feather name={icon} size={14} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
      <View style={styles.stepperWrap}>
        <Pressable onPress={dec} disabled={value <= min} style={({ pressed }) => [styles.stepBtn, { borderColor: colors.border, opacity: value <= min ? 0.4 : pressed ? 0.6 : 1 }]}> 
          <Feather name="minus" size={14} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.stepValue, { color: colors.foreground }]}>{display}</Text>
        <Pressable onPress={inc} disabled={value >= max} style={({ pressed }) => [styles.stepBtn, { borderColor: colors.border, opacity: value >= max ? 0.4 : pressed ? 0.6 : 1 }]}> 
          <Feather name="plus" size={14} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

function Toggle({
  icon,
  label,
  description,
  value,
  onChange,
  disabled,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, disabled && { opacity: 0.45 }]}> 
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}14` }]}> 
        <Feather name={icon} size={14} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {description ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={Platform.OS === "android" ? "#fff" : undefined}
      />
    </View>
  );
}

function ThemeToggle({ value, onChange }: { value: ThemePref; onChange: (next: ThemePref) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.themeWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      {([
        { key: "light" as ThemePref, label: "Light", icon: "sun" as const },
        { key: "dark" as ThemePref, label: "Dark", icon: "moon" as const },
      ]).map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              styles.themeOpt,
              active && {
                backgroundColor: colors.card,
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              },
            ]}
          >
            <Feather name={o.icon} size={14} color={active ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.themeText, { color: active ? colors.primary : colors.mutedForeground }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  onPress,
  danger,
  loading,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub?: string;
  onPress: () => void | Promise<void>;
  danger?: boolean;
  loading?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  const tint = danger ? colors.destructive : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!!loading}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        { opacity: loading ? 0.6 : pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${tint}14` }]}> 
        <Feather name={icon} size={14} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function InfoLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}> 
      <Text style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]}>{label}</Text>
      <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2, marginLeft: 4, marginBottom: 8 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rowHint: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  stepperWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontFamily: "Inter_700Bold", fontSize: 13, minWidth: 56, textAlign: "center" },
  themeWrap: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, paddingVertical: 4 },
  themeOpt: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 9 },
  themeText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  guideCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginHorizontal: 16, marginBottom: 12, gap: 6 },
  guideTitle: { fontFamily: "Inter_700Bold", fontSize: 14, marginBottom: 4 },
  guideStep: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  guideNote: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4, fontStyle: "italic" },
});
