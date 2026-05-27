import { Feather } from "@expo/vector-icons";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export type NotifStatus = "ok" | "needs-permission" | "needs-exact-alarm" | "blocked";

interface Props {
  status: NotifStatus;
  onDismiss?: () => void;
  compact?: boolean;
}

const MESSAGES: Record<NotifStatus, { title: string; body: string; action: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  ok: {
    title: "All set",
    body: "Timer alarms and reminders are working.",
    action: "",
    icon: "check-circle",
    color: "#22c55e",
  },
  "needs-permission": {
    title: "Allow notifications",
    body: "Topter can't send timer alarms or study reminders without notification permission.",
    action: "Open Settings",
    icon: "bell",
    color: "#f59e0b",
  },
  "needs-exact-alarm": {
    title: "Enable timer alarms",
    body: "Your phone blocks exact alarms. Find 'Alarms & reminders' in Settings → Apps → Special access (or Settings → Privacy → Permission manager) and Allow Topter.",
    action: "Open Settings",
    icon: "alert-triangle",
    color: "#f97316",
  },
  blocked: {
    title: "Notifications blocked",
    body: "Timer alarms and study reminders are turned off. Open Settings → Apps → Topter → Notifications to allow them.",
    action: "Open Settings",
    icon: "bell-off",
    color: "#ef4444",
  },
};

export default function NotificationPermissionBanner({ status, onDismiss, compact }: Props) {
  const colors = useColors();
  if (status === "ok" || Platform.OS === "web") return null;

  const cfg = MESSAGES[status];

  const handleAction = () => {
    if (status === "needs-permission" || status === "blocked") {
      Linking.openSettings().catch(() => {});
    } else if (status === "needs-exact-alarm") {
      // Android 12+ exact-alarm settings
      if (Platform.OS === "android") {
        Linking.sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", [
          { key: "android.provider.extra.APP_PACKAGE", value: "com.topter.app" },
        ]).catch(() => {
          // Fallback to general app settings
          Linking.openSettings().catch(() => {});
        });
      } else {
        Linking.openSettings().catch(() => {});
      }
    }
  };

  return (
    <View style={[styles.banner, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" }]}>
      <Feather name={cfg.icon} size={compact ? 16 : 18} color={cfg.color} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>{cfg.title}</Text>
        <Text style={[styles.body, { color: colors.foreground, opacity: 0.75 }]}>{cfg.body}</Text>
      </View>
      <Pressable onPress={handleAction} hitSlop={8} style={[styles.action, { backgroundColor: cfg.color }]}>
        <Text style={styles.actionText}>{cfg.action}</Text>
      </Pressable>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
          <Feather name="x" size={14} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 8,
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  body: { fontSize: 11, lineHeight: 15 },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dismiss: { padding: 2 },
});
