import React, { createContext, useCallback, useContext } from "react";

interface AdsContextValue {
  showInterstitialIfDue: () => Promise<void>;
  showRewardedAd: () => Promise<boolean>;
  bonusTopicsRemaining: number;
  grantBonusTopic: () => Promise<void>;
  consumeBonusTopic: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | null>(null);

const noop = async () => {};
const noopFalse = async () => false;

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const showInterstitialIfDue = useCallback(noop, []);
  const showRewardedAd = useCallback(noopFalse, []);
  const grantBonusTopic = useCallback(noop, []);
  const consumeBonusTopic = useCallback(noop, []);

  return (
    <AdsContext.Provider
      value={{
        showInterstitialIfDue,
        showRewardedAd,
        bonusTopicsRemaining: 0,
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
