import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 64 }: BrandMarkProps) {
  return (
    <Image
      source={require("../assets/images/logo.png")}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      resizeMode="cover"
    />
  );
}

interface BrandWordmarkProps {
  size?: number;
  color?: string;
}

export function BrandWordmark({ size = 28, color = "#0b1020" }: BrandWordmarkProps) {
  return (
    <View style={styles.wordmarkRow}>
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: size,
          letterSpacing: -0.5,
          color,
        }}
      >
        Topter
      </Text>
    </View>
  );
}

interface BrandTaglineProps {
  size?: number;
  color?: string;
}

export function BrandTagline({ size = 11, color = "#6b7280" }: BrandTaglineProps) {
  return (
    <Text
      style={{
        fontFamily: "Inter_600SemiBold",
        fontSize: size,
        letterSpacing: 1.8,
        color,
        textTransform: "uppercase",
        marginTop: 2,
      }}
    >
      Track, Revise, Remember
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
