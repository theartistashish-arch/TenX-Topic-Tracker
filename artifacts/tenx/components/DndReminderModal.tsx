import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

const DND_SEEN_KEY = "dnd_reminder_seen";

export async function hasDndReminderBeenSeen(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(DND_SEEN_KEY);
    return val === "1";
  } catch {
    return false;
  }
}

export async function markDndReminderSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(DND_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}

interface DndReminderModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function DndReminderModal({ visible, onDismiss }: DndReminderModalProps) {
  const handleGotIt = async () => {
    await markDndReminderSeen();
    onDismiss();
  };

  const handleDontShowAgain = async () => {
    await markDndReminderSeen();
    onDismiss();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={handleGotIt}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Feather name="bell-off" size={28} color="#a5b4fc" />
          </View>
          <Text style={styles.title}>Enable Do Not Disturb</Text>
          <Text style={styles.body}>
            Turn on Do Not Disturb or Focus Mode on your phone so notifications don't break your concentration.
          </Text>
          <Pressable
            onPress={handleGotIt}
            style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.9 : 1 }]}
          >
            <Text style={styles.primaryText}>Got it</Text>
          </Pressable>
          <Pressable
            onPress={handleDontShowAgain}
            style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.ghostText}>Don't show again</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 14,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(165,180,252,0.12)",
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  body: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  primary: {
    width: "100%",
    backgroundColor: "#a5b4fc",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryText: {
    color: "#0b1020",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  ghost: {
    paddingVertical: 6,
  },
  ghostText: {
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
