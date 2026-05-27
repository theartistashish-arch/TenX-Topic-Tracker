import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import MobileAds, {
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

import { useSubscription } from "@/lib/revenuecat";

// ── Ad unit IDs ────────────────────────────────────────────────────────────
// Falls back to Google test IDs in dev or when real IDs are not configured.
// Guard against placeholder strings (e.g. "YOUR_ADMOB_APP_ID") so production
// builds never crash from invalid IDs — ads simply won't load.
function resolveAdId(envVar: string | undefined, testId: string): string {
  if (!envVar || envVar.startsWith("YOUR_")) return testId;
  return envVar;
}

// NOTE: Using Google demo ad IDs for closed testing to avoid invalid traffic.
// Swap back to real IDs (EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID) before production release.
const INTERSTITIAL_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";

// NOTE: Using Google demo ad IDs for closed testing to avoid invalid traffic.
// Swap back to real IDs (EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID) before production release.
const REWARDED_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";

// NOTE: Using Google demo app ID for closed testing. No invalid traffic risk.
// Swap back to real ID (EXPO_PUBLIC_ADMOB_ANDROID_APP_ID) before production release.
const APP_ID = "ca-app-pub-3940256099942544~3347511713";

// ── Session counter ────────────────────────────────────────────────────────
const SESSION_COUNT_KEY = "tenx.ads.sessionCount";
const AD_EVERY_N_SESSIONS = 3;

async function incrementSessionCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_COUNT_KEY);
    const next = (raw ? parseInt(raw, 10) || 0 : 0) + 1;
    await AsyncStorage.setItem(SESSION_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

// ── Daily bonus (rewarded ad unlocks) ─────────────────────────────────────
// Persisted in AsyncStorage. Rolls over at midnight (new date key).
const DAILY_BONUS_KEY = "tenx.ads.dailyBonus";

interface DailyBonus {
  date: string; // "YYYY-MM-DD"
  granted: number; // slots unlocked by watching ads today
  used: number; // slots consumed by adding topics today
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readDailyBonus(): Promise<DailyBonus> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_BONUS_KEY);
    if (raw) {
      const bonus = JSON.parse(raw) as DailyBonus;
      if (bonus.date === todayKey()) return bonus;
    }
  } catch {}
  // New day (or first run) — start fresh
  return { date: todayKey(), granted: 0, used: 0 };
}

async function writeDailyBonus(bonus: DailyBonus): Promise<void> {
  await AsyncStorage.setItem(DAILY_BONUS_KEY, JSON.stringify(bonus));
}

// ── Platform guard ─────────────────────────────────────────────────────────
const isNative = Platform.OS === "android" || Platform.OS === "ios";

// ── Context ────────────────────────────────────────────────────────────────
interface AdsContextValue {
  /** Shows interstitial if every-N-sessions threshold is met. No-op for Pro. Awaitable. */
  showInterstitialIfDue: () => Promise<void>;
  /** Shows a rewarded ad. No-op for Pro (returns false). Returns true when reward earned. */
  showRewardedAd: () => Promise<boolean>;
  /** Remaining bonus topic slots for today (resets at midnight). */
  bonusTopicsRemaining: number;
  /** Grants one bonus topic slot (call after a successful rewarded ad). */
  grantBonusTopic: () => Promise<void>;
  /** Consumes one bonus topic slot (call after a bypassed addTopic succeeds). */
  consumeBonusTopic: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | null>(null);

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const { isPro } = useSubscription();
  const [sdkReady, setSdkReady] = useState(false);

  // ── Daily bonus state ────────────────────────────────────────────────────
  const [bonusData, setBonusData] = useState<DailyBonus>({
    date: todayKey(),
    granted: 0,
    used: 0,
  });

  useEffect(() => {
    readDailyBonus().then(setBonusData).catch(() => {});
  }, []);

  const bonusTopicsRemaining = Math.max(0, bonusData.granted - bonusData.used);

  const grantBonusTopic = useCallback(async (): Promise<void> => {
    const current = await readDailyBonus();
    const updated = { ...current, granted: current.granted + 1 };
    await writeDailyBonus(updated);
    setBonusData(updated);
  }, []);

  const consumeBonusTopic = useCallback(async (): Promise<void> => {
    const current = await readDailyBonus();
    if (current.used >= current.granted) return; // Nothing to consume
    const updated = { ...current, used: current.used + 1 };
    await writeDailyBonus(updated);
    setBonusData(updated);
  }, []);

  // ── SDK init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative) return;
    const timer = setTimeout(() => {
      MobileAds()
        .initialize()
        .then(() => setSdkReady(true))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // ── Preloaded interstitial ────────────────────────────────────────────────
  // Load one interstitial in the background after SDK init so it is ready
  // well before the user reaches the receipt screen.
  const preloadedAdRef = useRef<InterstitialAd | null>(null);
  const preloadedReadyRef = useRef(false);

  const preloadInterstitial = useCallback(() => {
    if (!isNative || !sdkReady) return;
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);
    ad.addAdEventListener(AdEventType.LOADED, () => {
      preloadedAdRef.current = ad;
      preloadedReadyRef.current = true;
    });
    ad.addAdEventListener(AdEventType.ERROR, () => {
      preloadedAdRef.current = null;
      preloadedReadyRef.current = false;
    });
    ad.load();
  }, [sdkReady]);

  useEffect(() => {
    if (sdkReady) preloadInterstitial();
  }, [sdkReady, preloadInterstitial]);

  // ── showInterstitialIfDue ─────────────────────────────────────────────────
  const showInterstitialIfDue = useCallback(async (): Promise<void> => {
    if (isPro || !isNative || !sdkReady) return;
    const count = await incrementSessionCount();
    if (count % AD_EVERY_N_SESSIONS !== 0) return;

    return new Promise<void>((resolve) => {
      let settled = false;
      const listeners: Array<() => void> = [];
      let timeoutId: ReturnType<typeof setTimeout>;

      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        listeners.forEach((fn) => fn());
        listeners.length = 0;
        resolve();
      };

      // Safety timeout — if the interstitial doesn't respond in 10 s, skip it
      // so the session-end flow is never blocked by a hanging ad.
      timeoutId = setTimeout(settle, 10_000);

      try {
        // Use preloaded ad if ready, otherwise load on demand
        const ad =
          preloadedReadyRef.current && preloadedAdRef.current
            ? preloadedAdRef.current
            : InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);

        const wasPreloaded = preloadedReadyRef.current;

        // Clear preload refs so we don't reuse this instance
        preloadedAdRef.current = null;
        preloadedReadyRef.current = false;

        const onClose = () => {
          // Preload the next interstitial for the session after this one
          preloadInterstitial();
          settle();
        };

        if (wasPreloaded) {
          // Ad is already loaded — just attach close/error listeners and show
          listeners.push(ad.addAdEventListener(AdEventType.CLOSED, onClose));
          listeners.push(ad.addAdEventListener(AdEventType.ERROR, settle));
          try {
            ad.show();
          } catch {
            settle();
          }
        } else {
          // Load on demand
          listeners.push(
            ad.addAdEventListener(AdEventType.LOADED, () => {
              try {
                ad.show();
              } catch {
                settle();
              }
            }),
          );
          listeners.push(ad.addAdEventListener(AdEventType.CLOSED, onClose));
          listeners.push(ad.addAdEventListener(AdEventType.ERROR, settle));
          ad.load();
        }
      } catch {
        settle();
      }
    });
  }, [isPro, sdkReady, preloadInterstitial]);

  // ── showRewardedAd ────────────────────────────────────────────────────────
  const showRewardedAd = useCallback(async (): Promise<boolean> => {
    // No-op for Pro users — they never see ads
    if (isPro) return false;
    // Web / preview: auto-succeed so the bonus topic flow can be tested
    if (!isNative || !sdkReady) return true;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const listeners: Array<() => void> = [];
      let earned = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      // Single-fire resolve — prevents double-resolve and cleans up all
      // listeners + the safety timeout whenever the promise settles.
      const settle = (val: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        listeners.forEach((fn) => fn());
        listeners.length = 0;
        resolve(val);
      };

      // Safety timeout: AdMob can hang indefinitely when the app is under
      // review or the device has no eligible ads. After 15 s we give up and
      // let the break start anyway — ads should never block a core feature.
      timeoutId = setTimeout(() => settle(false), 15_000);

      try {
        const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID);

        listeners.push(
          ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
            try {
              ad.show();
            } catch {
              settle(false);
            }
          }),
        );
        listeners.push(
          ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            earned = true;
          }),
        );
        listeners.push(
          ad.addAdEventListener(AdEventType.CLOSED, () => settle(earned)),
        );
        listeners.push(
          ad.addAdEventListener(AdEventType.ERROR, () => settle(false)),
        );

        ad.load();
      } catch {
        settle(false);
      }
    });
  }, [isPro, sdkReady]);

  return (
    <AdsContext.Provider
      value={{
        showInterstitialIfDue,
        showRewardedAd,
        bonusTopicsRemaining,
        grantBonusTopic,
        consumeBonusTopic,
      }}
    >
      {children}
    </AdsContext.Provider>
  );
}

export function useAds(): AdsContextValue {
  const ctx = useContext(AdsContext);
  if (!ctx) throw new Error("useAds must be used within AdsProvider");
  return ctx;
}
