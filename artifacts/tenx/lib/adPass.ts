import AsyncStorage from "@react-native-async-storage/async-storage";

const AD_PASS_KEY = "adPassExpiry";

function tomorrowMidnight(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Grants a daily ad pass valid until tomorrow midnight. */
export async function activateAdPass(): Promise<void> {
  await AsyncStorage.setItem(AD_PASS_KEY, String(tomorrowMidnight()));
}

/** Returns true if a daily ad pass is still active (not yet expired). */
export async function checkAdPassActive(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AD_PASS_KEY);
    if (!raw) return false;
    return parseInt(raw, 10) > Date.now();
  } catch {
    return false;
  }
}
