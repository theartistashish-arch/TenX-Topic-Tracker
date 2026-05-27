import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import firestore from "@react-native-firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

// ── Local isPro cache ───────────────────────────────────────────────────────
// Persists across app restarts so Pro users are recognised instantly,
// before the RevenueCat network response arrives.
const IS_PRO_CACHE_KEY = "tenx.rc.isPro";

async function readCachedIsPro(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(IS_PRO_CACHE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

async function writeCachedIsPro(isPro: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(IS_PRO_CACHE_KEY, isPro ? "true" : "false");
  } catch {}
}

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat Public API Keys not configured");
  }
  if (Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

export let revenueCatConfigured = false;

export function initializeRevenueCat() {
  try {
    const apiKey = getRevenueCatApiKey();
    Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey });
    revenueCatConfigured = true;
  } catch {
    revenueCatConfigured = false;
  }
}

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"] as const;

async function syncProStatusToFirestore(uid: string, customerInfo: CustomerInfo) {
  const isPro =
    customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  try {
    // update writes only the changed leaf — less data than set merge.
    await firestore().collection("users").doc(uid).update({ isPro });
  } catch {
    // Non-critical — RevenueCat is the source of truth for Pro status
  }
}

function useSubscriptionContext() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  // ── Local isPro cache ─────────────────────────────────────────────────────
  // Initialise from AsyncStorage so Pro status is known before RC responds.
  const [cachedIsPro, setCachedIsPro] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  useEffect(() => {
    readCachedIsPro()
      .then((val) => {
        setCachedIsPro(val);
        setCacheLoaded(true);
      })
      .catch(() => setCacheLoaded(true));
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let cancelled = false;

    async function syncIdentity() {
      try {
        if (currentUser) {
          await Purchases.logIn(currentUser.id);
        } else {
          await Purchases.logOut();
        }
        if (!cancelled) {
          await queryClient.invalidateQueries({ queryKey: CUSTOMER_INFO_KEY });
        }
      } catch {
        // Ignore errors
      }
    }

    void syncIdentity();
    return () => { cancelled = true; };
  }, [currentUser, queryClient]);

  const customerInfoQuery = useQuery({
    queryKey: CUSTOMER_INFO_KEY,
    queryFn: async () => Purchases.getCustomerInfo(),
    staleTime: 60 * 1000,
    enabled: revenueCatConfigured,
  });

  // Derive live isPro from RC response
  const liveIsPro =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  // Sync cache + Firestore whenever RC data arrives
  useEffect(() => {
    if (customerInfoQuery.data === undefined) return;
    // Update local cache whenever the live value changes
    if (liveIsPro !== cachedIsPro) {
      setCachedIsPro(liveIsPro);
    }
    void writeCachedIsPro(liveIsPro);
    if (currentUser) {
      void syncProStatusToFirestore(currentUser.id, customerInfoQuery.data);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInfoQuery.data, currentUser]);

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => Purchases.getOfferings(),
    staleTime: 300 * 1000,
    enabled: revenueCatConfigured,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    refetchOnWindowFocus: true,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      // Immediately update cache so the new Pro status is reflected at once
      const nowPro =
        customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      setCachedIsPro(nowPro);
      void writeCachedIsPro(nowPro);
      if (currentUser) {
        void syncProStatusToFirestore(currentUser.id, customerInfo);
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const customerInfo = await Purchases.restorePurchases();
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
      const nowPro =
        customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      setCachedIsPro(nowPro);
      void writeCachedIsPro(nowPro);
      if (currentUser) {
        void syncProStatusToFirestore(currentUser.id, customerInfo);
      }
    },
  });

  // Use live RC data when available; fall back to the AsyncStorage cache
  // while the network request is in-flight. This means Pro users are
  // never incorrectly blocked between app restarts.
  const isPro = customerInfoQuery.data !== undefined ? liveIsPro : cachedIsPro;

  // True while we don't yet know the definitive Pro status (cache not loaded
  // OR RC query still running for the first time with no cached data).
  const isCustomerInfoLoading =
    !cacheLoaded || (customerInfoQuery.isLoading && !cachedIsPro);

  const offeringsError =
    !revenueCatConfigured
      ? new Error("Payment setup is not configured yet.")
      : offeringsQuery.error ?? null;

  const retryOfferings = () => {
    void queryClient.invalidateQueries({ queryKey: ["revenuecat", "offerings"] });
    void offeringsQuery.refetch();
  };

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    offeringsLoading: offeringsQuery.isLoading,
    offeringsError,
    isPro,
    isCustomerInfoLoading,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    retryOfferings,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
