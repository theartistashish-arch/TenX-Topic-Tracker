import Constants from "expo-constants";
import React, { createContext, useContext, useEffect } from "react";
import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, updateDoc, setDoc } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db, firebaseConfigured } from "@/lib/firebase";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat Public API Keys not configured");
  }
  // Web and Expo Go (storeClient) always use the test-store key.
  // Native builds — including EAS dev/sandbox builds — use the real platform key
  // so sandbox purchases route through the correct store.
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
    // Missing API keys — RevenueCat not available.  The paywall will fall back
    // to static pricing so the user never sees a broken screen.
    revenueCatConfigured = false;
  }
}

const CUSTOMER_INFO_KEY = ["revenuecat", "customer-info"] as const;

async function syncProStatusToFirestore(uid: string, customerInfo: CustomerInfo) {
  if (!firebaseConfigured || !db) return;
  const isPro =
    customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  try {
    // updateDoc writes only the changed leaf — less data than setDoc merge.
    await updateDoc(doc(db, "users", uid), { isPro, updatedAt: Date.now() });
  } catch {
    // Fallback: doc may not exist yet (rare). Non-critical anyway —
    // RevenueCat is the source of truth for Pro status.
    try {
      await setDoc(doc(db, "users", uid), { isPro }, { merge: true });
    } catch {
      // ignore
    }
  }
}

function useSubscriptionContext() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  // ── Auth identity coupling ──────────────────────────────────────────────────
  // Keep RevenueCat in sync with the Firebase auth user so purchase history
  // is tied to the correct account across devices.
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
        // Ignore errors (e.g. already logged in with same id, or web stub)
      }
    }

    void syncIdentity();
    return () => { cancelled = true; };
  }, [currentUser, queryClient]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const customerInfoQuery = useQuery({
    queryKey: CUSTOMER_INFO_KEY,
    queryFn: async () => Purchases.getCustomerInfo(),
    staleTime: 60 * 1000,
    enabled: revenueCatConfigured,
  });

  // Sync Pro status to Firestore whenever customer info is fetched or refreshed.
  // This keeps the backend in sync for users who purchased on another device/session.
  useEffect(() => {
    if (currentUser && customerInfoQuery.data) {
      void syncProStatusToFirestore(currentUser.id, customerInfoQuery.data);
    }
  }, [currentUser, customerInfoQuery.data]);

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      // RevenueCat returns an empty Offering object when Play Store / App Store
      // products aren't configured yet.  We still resolve so the UI can show
      // fallback prices instead of hanging on a spinner.
      const offerings = await Purchases.getOfferings();
      return offerings;
    },
    staleTime: 300 * 1000,
    enabled: revenueCatConfigured,
    retry: 1,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(CUSTOMER_INFO_KEY, customerInfo);
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
      if (currentUser) {
        void syncProStatusToFirestore(currentUser.id, customerInfo);
      }
    },
  });

  const isPro =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  const isCustomerInfoLoading = customerInfoQuery.isLoading;

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
