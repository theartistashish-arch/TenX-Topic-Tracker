import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";

import { TabBar } from "@/components/TabBar";
import { useSettings } from "@/contexts/SettingsContext";
import { useTopics } from "@/contexts/TopicsContext";

export default function TabsLayout() {
  const { isLoading: topicsLoading } = useTopics();
  const { isLoading: settingsLoading } = useSettings();
  const contentReady = !topicsLoading && !settingsLoading;

  const opacity = useRef(new Animated.Value(0)).current;
  // Once revealed, never hide again (prevents flickering on background refetches).
  const revealed = useRef(false);

  useEffect(() => {
    if (contentReady && !revealed.current) {
      revealed.current = true;
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [contentReady, opacity]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <Animated.View style={{ opacity }} pointerEvents={contentReady ? "auto" : "none"}>
          <TabBar {...props} />
        </Animated.View>
      )}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="pulse" options={{ title: "Pulse" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
    </Tabs>
  );
}
