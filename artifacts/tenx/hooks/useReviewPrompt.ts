import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { useEffect } from "react";
import { Platform } from "react-native";

const APP_OPEN_COUNT_KEY = "tenx.review.appOpenCount";
const REVIEW_REQUESTED_KEY = "tenx.review.requested";
const PROMPT_THRESHOLD = 5; // Ask after 5 app opens

/**
 * Tracks app opens and requests an in-app review from the platform store
 * after the user has opened the app a few times. Only asks once.
 */
export function useReviewPrompt() {
  useEffect(() => {
    if (Platform.OS === "web" || __DEV__) return;

    void (async () => {
      try {
        // Check if we already asked
        const alreadyRequested = await AsyncStorage.getItem(REVIEW_REQUESTED_KEY);
        if (alreadyRequested === "true") return;

        // Increment open count
        const raw = await AsyncStorage.getItem(APP_OPEN_COUNT_KEY);
        const count = raw ? parseInt(raw, 10) || 0 : 0;
        const next = count + 1;
        await AsyncStorage.setItem(APP_OPEN_COUNT_KEY, String(next));

        // If threshold reached and store review is available, request it
        if (next >= PROMPT_THRESHOLD) {
          const isAvailable = await StoreReview.isAvailableAsync();
          if (isAvailable) {
            await StoreReview.requestReview();
            await AsyncStorage.setItem(REVIEW_REQUESTED_KEY, "true");
          }
        }
      } catch {
        // Silently ignore any errors (store review might not be available)
      }
    })();
  }, []);
}
