import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="pulse" options={{ title: "Pulse" }} />
    </Tabs>
  );
}
