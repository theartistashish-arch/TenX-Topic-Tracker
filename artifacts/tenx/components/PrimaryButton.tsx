import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  style,
}: PrimaryButtonProps) {
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.wrap,
        style,
        { opacity: isDisabled ? 0.6 : pressed ? 0.92 : 1 },
      ]}
    >
      <LinearGradient
        colors={["#4f46e5", "#22d3ee"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.row}>
          {loading ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.label}>{title}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#4f46e5",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  gradient: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
