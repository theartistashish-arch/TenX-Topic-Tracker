import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

import { TabBar } from "@/components/TabBar";
import { useAuth } from "@/contexts/AuthContext";

export default function TabsLayout() {
  const { isLoading } = useAuth();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, opacity]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <Animated.View style={{ opacity }} pointerEvents={isLoading ? "none" : "auto"}>
          <TabBar {...props} />
        </Animated.View>
      )}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="pulse" options={{ title: "Pulse" }} />
    </Tabs>
  );
}
