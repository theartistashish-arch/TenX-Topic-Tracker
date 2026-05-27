import React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface BreakTipCarouselProps {
  tip: string;
  pulse: Animated.Value;
}

export function BreakTipCarousel({ tip, pulse }: BreakTipCarouselProps) {
  return (
    <Animated.View
      style={[styles.card, { transform: [{ scale: pulse }] }]}
    >
      <View style={styles.badge} />
      <Text style={styles.eyebrow}>Healthy tip</Text>
      <Text style={styles.tip}>{tip}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(34,211,238,0.1)",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.28)",
  },
  badge: {
    width: 44,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(34,211,238,0.5)",
    marginBottom: 12,
  },
  eyebrow: {
    color: "#22d3ee",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  tip: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    lineHeight: 22,
  },
});
