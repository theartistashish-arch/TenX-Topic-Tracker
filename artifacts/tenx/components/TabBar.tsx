import { Feather, Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  home: "home",
  library: "book-open",
  pulse: "activity",
};

const LABELS: Record<string, string> = {
  home: "Home",
  library: "Library",
  pulse: "Pulse",
  insights: "Insights",
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const bottomPad = isWeb ? Math.max(insets.bottom, 12) : Math.max(insets.bottom, 8);

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]}>
      <LinearGradient
        colors={["rgba(11,16,32,0.96)", "rgba(11,16,32,0.92)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bar}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const icon = ICONS[route.name] ?? "circle";
          const label = LABELS[route.name] ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync().catch(() => {});
              }
              navigation.navigate(route.name as never);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tab,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              hitSlop={6}
            >
              <View
                style={[
                  styles.iconWrap,
                  isFocused && styles.iconWrapActive,
                ]}
              >
                {route.name === "insights" ? (
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color={isFocused ? "#0b1020" : "rgba(255,255,255,0.7)"}
                  />
                ) : (
                  <Feather
                    name={icon}
                    size={20}
                    color={isFocused ? "#0b1020" : "rgba(255,255,255,0.7)"}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  { color: isFocused ? "#22d3ee" : "rgba(255,255,255,0.6)" },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
  bar: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  iconWrapActive: {
    backgroundColor: "#22d3ee",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
