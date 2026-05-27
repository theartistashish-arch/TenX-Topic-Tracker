import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_ACTIVE_KEY = "tenx.lastActiveAt";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns the number of whole days since the last recorded app open.
 *  Returns 0 if this is the first open or the stored timestamp is invalid. */
export async function getAbsenceDays(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return 0;
    const lastActive = parseInt(raw, 10);
    if (!Number.isFinite(lastActive) || lastActive <= 0) return 0;
    const diffMs = Date.now() - lastActive;
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / DAY_MS);
  } catch {
    return 0;
  }
}

/** Stamps the current time as the last active timestamp.
 *  Call this after reading absence days so the reading is accurate. */
export async function recordAppOpen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  } catch {
    // ignore persistence failures
  }
}
