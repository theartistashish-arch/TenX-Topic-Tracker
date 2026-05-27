import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

interface BreakPopupProps {
  visible: boolean;
  onContinue: () => void;
  onBreak: () => void;
}

export function BreakPopup({ visible, onContinue, onBreak }: BreakPopupProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.pulse} />
          <Text style={styles.title}>Take a short break</Text>
          <Text style={styles.subtitle}>Reset your mind. Come back stronger.</Text>
          <View style={styles.row}>
            <Pressable
              onPress={onContinue}
              style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.secondaryText}>Continue study</Text>
            </Pressable>
            <Pressable
              onPress={onBreak}
              style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={styles.primaryText}>Take break</Text>
            </Pressable>
          </View>
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
    padding: 22,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 16,
  },
  pulse: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(34,211,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
    marginBottom: 2,
  },
  title: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  secondary: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  primary: {
    flex: 1,
    backgroundColor: "#22d3ee",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryText: {
    color: "#0b1020",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
