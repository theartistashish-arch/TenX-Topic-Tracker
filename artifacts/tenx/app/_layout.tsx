import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { Asset } from "expo-asset";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SplashAnimation } from "@/components/SplashAnimation";
import { AuthProvider } from "@/contexts/AuthContext";
import { ExamModeProvider, computeExamPhase, useExamMode } from "@/contexts/ExamModeContext";
import { useSettings, SettingsProvider } from "@/contexts/SettingsContext";
import { TopicsProvider, useTopics } from "@/contexts/TopicsContext";
import { useColors } from "@/hooks/useColors";
import { useReviewPrompt } from "@/hooks/useReviewPrompt";
import { AdsProvider } from "@/lib/ads";
import { recordAppOpen } from "@/lib/absenceDetection";
import { REVISION_NOTIF_PREFIX, isTimerNotification, scheduleDailyNotifications, scheduleComebackNotification, ensureTimerChannel } from "@/lib/notifications";
import { focusSessionActive } from "@/lib/focusStorage";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";

// Show revision reminders in foreground; suppress timer alarms (handled in-app).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isTimer = isTimerNotification(notification.request.identifier);
    return {
      shouldShowBanner: !isTimer,
      shouldShowList: !isTimer,
      shouldPlaySound: !isTimer,
      shouldSetBadge: false,
    };
  },
});

try {
  initializeRevenueCat();
} catch {
  // RevenueCat keys not configured — app runs without Pro features
}

// Create the high-importance Android timer channel at startup so it's
// ready before the first focus session schedules a notification.
if (Platform.OS === "android") {
  ensureTimerChannel().catch(() => {});
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ── Notification scheduler ─────────────────────────────────────────────────
// Lives inside SettingsProvider + TopicsProvider so it can read live data.

function NotificationScheduler() {
  const { settings } = useSettings();
  const { topics } = useTopics();
  const didMount = useRef(false);

  // Schedule on first mount and whenever settings change (force = true to bypass throttle).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const force = didMount.current;
    didMount.current = true;
    void scheduleDailyNotifications(topics, settings, force);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.remindersEnabled, settings.morningReminderEnabled, settings.eveningReminderEnabled, settings.streakAlertsEnabled, settings.motivationalInsightsEnabled]);

  // Re-schedule when topics change (e.g. after recording a session).
  // Throttled — won't actually reschedule within 6 h unless the above fires.
  useEffect(() => {
    if (Platform.OS === "web") return;
    void scheduleDailyNotifications(topics, settings, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics]);

  // Re-schedule when app comes back to foreground (covers day changes).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void scheduleDailyNotifications(topics, settings, false);
      }
    });
    return () => sub.remove();
  }, [topics, settings]);

  return null;
}

// ── Deep-link handler ──────────────────────────────────────────────────────
// Listens for notification taps and navigates to the correct screen.

const ALLOWED_NOTIF_SCREENS = new Set([
  "/(tabs)/home",
  "/(tabs)/pulse",
  "/(tabs)/library",
  "/(tabs)/insights",
]);

function NotificationDeepLink() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.identifier;
      if (!id.startsWith(REVISION_NOTIF_PREFIX)) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const raw = typeof data?.screen === "string" ? data.screen : "";
      const screen = ALLOWED_NOTIF_SCREENS.has(raw) ? raw : "/(tabs)/home";
      // Small delay to ensure the navigator is ready after cold start.
      setTimeout(() => {
        try {
          router.push(screen as Parameters<typeof router.push>[0]);
        } catch {
          // ignore navigation errors on cold start
        }
      }, 500);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

// ── App-open tracker ──────────────────────────────────────────────────────
// Records the current timestamp in AsyncStorage whenever the app returns to
// foreground so the absence-detection utility can compute days since last use.
// Note: does NOT record on initial mount — the home screen handles the very
// first open atomically (read-then-write) to ensure accurate absence counting.

function AppOpenTracker() {
  // Schedule comeback on first launch to start the 2-day countdown.
  useEffect(() => {
    if (Platform.OS !== "web") {
      void scheduleComebackNotification();
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void recordAppOpen();
        // Reset the 2-day comeback countdown on every foreground.
        void scheduleComebackNotification();
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

// ── Exam Lifecycle Bridge ──────────────────────────────────────────────────
// Sits inside both TopicsProvider and ExamModeProvider.
// Handles auto-deactivation atomically: restores suspended topics then clears mode.

function ExamLifecycleBridge() {
  const { examModeActive, examDate, deactivateExamMode } = useExamMode();
  const { restoreSuspendedSubjects, isLoading: topicsLoading } = useTopics();
  const handlingRef = useRef(false);

  const handleExamEnded = useCallback(async () => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    try {
      await restoreSuspendedSubjects();
      await deactivateExamMode();
    } catch {
      // ignore
    } finally {
      handlingRef.current = false;
    }
  }, [restoreSuspendedSubjects, deactivateExamMode]);

  // Check whenever examModeActive/examDate changes — covers post-hydration detection.
  // IMPORTANT: skip until topics have hydrated from storage to avoid persisting an
  // empty allTopics array and wiping the user's topic data.
  useEffect(() => {
    if (topicsLoading) return;
    if (!examModeActive || !examDate) return;
    if (computeExamPhase(examDate) === "ended") {
      void handleExamEnded();
    }
  }, [topicsLoading, examModeActive, examDate, handleExamEnded]);

  // Also check when app returns to foreground (guard against pre-hydration too)
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      if (topicsLoading) return;
      if (!examModeActive || !examDate) return;
      if (computeExamPhase(examDate) === "ended") {
        void handleExamEnded();
      }
    });
    return () => sub.remove();
  }, [topicsLoading, examModeActive, examDate, handleExamEnded]);

  return null;
}

// ── In-app review prompt ───────────────────────────────────────────────────
// Asks the user to rate the app after 5 opens. Only asks once.

function ReviewPrompt() {
  useReviewPrompt();
  return null;
}

// ── Root navigator ─────────────────────────────────────────────────────────

function RootLayoutNav() {
  const colors = useColors();
  const { settings } = useSettings();
  const isDark = settings.theme === "dark";
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} translucent />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="about" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="new-topic"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="topic/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="pre-focus" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="focus" options={{ gestureEnabled: false }} />
        <Stack.Screen name="receipt" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
        <Stack.Screen
          name="paywall"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
      <NotificationDeepLink />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    void Asset.loadAsync([
      require("../assets/images/icon.png"),
      require("../assets/images/logo.png"),
    ])
      .catch(() => {})
      .finally(() => setAssetsLoaded(true));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && assetsLoaded) {
      SplashScreen.hideAsync();
      setAppReady(true);
    }
  }, [fontsLoaded, fontError, assetsLoaded]);

  // Request notification permission once on first launch (after app is ready).
  // This covers users who never open the focus timer.
  useEffect(() => {
    if (!appReady || Platform.OS === "web") return;
    Notifications.requestPermissionsAsync().catch(() => {});
  }, [appReady]);

  // ── OTA updates ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web" || __DEV__) return;
    void (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable && !focusSessionActive) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Silently ignore update errors (offline, no updates, etc.)
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || __DEV__) return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void (async () => {
          try {
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable && !focusSessionActive) {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            }
          } catch {
            // Silently ignore
          }
        })();
      }
    });
    return () => sub.remove();
  }, []);

  if ((!fontsLoaded && !fontError) || !assetsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <SubscriptionProvider>
                  <AdsProvider>
                    <SettingsProvider>
                      <TopicsProvider>
                        <ExamModeProvider>
                          <AppOpenTracker />
                          <ExamLifecycleBridge />
                          <NotificationScheduler />
                          <ReviewPrompt />
                          <RootLayoutNav />
                          {appReady && showSplash && (
                            <SplashAnimation onFinish={() => setShowSplash(false)} />
                          )}
                        </ExamModeProvider>
                      </TopicsProvider>
                    </SettingsProvider>
                  </AdsProvider>
                </SubscriptionProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
