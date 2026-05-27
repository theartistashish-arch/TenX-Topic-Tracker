import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { REVENUECAT_ENTITLEMENT_IDENTIFIER, useSubscription } from "@/lib/revenuecat";

const BENEFITS = [
  { icon: "layers" as const, text: "Unlimited subjects & topics" },
  { icon: "bar-chart-2" as const, text: "Pulse analytics — full breakdown" },
  { icon: "zap" as const, text: "Exam Mode — priority scheduling" },
  { icon: "activity" as const, text: "Topic detail retention charts" },
  { icon: "clock" as const, text: "Spaced-repetition scheduling" },
  { icon: "eye-off" as const, text: "Ad-free experience" },
];

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    offerings,
    offeringsLoading,
    offeringsError,
    isPurchasing,
    isRestoring,
    purchase,
    restore,
    retryOfferings,
    isPro,
  } = useSubscription();

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const currentOffering = offerings?.current;
  const monthlyPkg = currentOffering?.availablePackages.find(
    (p) => p.packageType === "MONTHLY" || p.identifier === "$rc_monthly",
  );
  const annualPkg = currentOffering?.availablePackages.find(
    (p) => p.packageType === "ANNUAL" || p.identifier === "$rc_annual",
  );

  const [selectedPkg, setSelectedPkg] = useState<"monthly" | "annual">("annual");
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [isRetryingStore, setIsRetryingStore] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successScale = useRef(new Animated.Value(0.8)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const chosenPkg = selectedPkg === "annual" ? annualPkg : monthlyPkg;

  // When offerings load while a retry is in progress, auto-trigger the purchase.
  useEffect(() => {
    if (!isRetryingStore || !chosenPkg) return;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setIsRetryingStore(false);
    setErrorMsg(null);
    void doPurchase();
  // doPurchase is defined below; using a ref to avoid stale closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetryingStore, chosenPkg]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // RevenueCat test store always returns USD pricing; real stores return INR.
  // When the currency is not INR we show the intended INR prices instead.
  const MONTHLY_INR = 29;
  const ANNUAL_INR = 249;
  const isInrStore = monthlyPkg?.product.currencyCode === "INR";

  const monthlyPrice = monthlyPkg
    ? isInrStore
      ? monthlyPkg.product.priceString
      : `₹${MONTHLY_INR}`
    : `₹${MONTHLY_INR}`;
  const annualPrice = annualPkg
    ? isInrStore
      ? annualPkg.product.priceString
      : `₹${ANNUAL_INR}`
    : `₹${ANNUAL_INR}`;

  // Monthly equivalent shown under the annual card, e.g. "~₹20/mo"
  const annualMonthlyEquiv = isInrStore && annualPkg
    ? annualPkg.product.price / 12
    : ANNUAL_INR / 12;

  // Savings % comparing annual to paying monthly for 12 months
  const annualSavingsPct = isInrStore && monthlyPkg && annualPkg
    ? Math.round(
        ((monthlyPkg.product.price * 12 - annualPkg.product.price) /
          (monthlyPkg.product.price * 12)) *
          100,
      )
    : Math.round(((MONTHLY_INR * 12 - ANNUAL_INR) / (MONTHLY_INR * 12)) * 100);

  // Human-readable price for the currently selected package
  const chosenPriceString = isInrStore
    ? (chosenPkg?.product.priceString ?? "")
    : selectedPkg === "annual"
    ? `₹${ANNUAL_INR}`
    : `₹${MONTHLY_INR}`;

  const handlePurchase = async () => {
    if (!chosenPkg) {
      // Offerings haven't loaded — kick off a fresh fetch and wait.
      // The useEffect above will auto-trigger doPurchase once they load.
      // A 12s timeout shows a clear error if the store still can't connect.
      setErrorMsg(null);
      setIsRetryingStore(true);
      retryOfferings();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        setIsRetryingStore(false);
        setErrorMsg("Could not connect to Google Play. Check your internet connection and try again.");
      }, 12000);
      return;
    }
    if (__DEV__) {
      setConfirmVisible(true);
      return;
    }
    await doPurchase();
  };

  const showSuccessModal = () => {
    successScale.setValue(0.8);
    successOpacity.setValue(0);
    setPurchaseSuccess(true);
    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const doPurchase = async () => {
    setConfirmVisible(false);
    setErrorMsg(null);
    try {
      await purchase(chosenPkg!);
      showSuccessModal();
    } catch (err: unknown) {
      const e = err as { userCancelled?: boolean; code?: string; message?: string };
      if (e.userCancelled) {
        // User explicitly dismissed the sheet — no error shown.
        // Reset state so the button is immediately tappable again.
        return;
      }
      // Show via Alert so it's always visible regardless of scroll position.
      const msg = e.message ?? "Purchase failed. Please try again.";
      setErrorMsg(msg);
      Alert.alert("Purchase failed", msg, [{ text: "OK" }]);
    }
  };

  const handleRestore = async () => {
    setErrorMsg(null);
    try {
      const restoredInfo = await restore();
      const isNowPro =
        restoredInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      if (isNowPro) {
        showSuccessModal();
      } else {
        setRestoreSuccess(true);
        setTimeout(() => setRestoreSuccess(false), 1500);
      }
    } catch {
      setErrorMsg("Could not restore purchases. Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 8, paddingBottom: bottomInset + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={["#4f46e5", "#7c3aed"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}>
            <Feather name="zap" size={32} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Topter Pro</Text>
          <Text style={styles.heroSubtitle}>
            Unlock your full study potential
          </Text>
        </LinearGradient>

        {/* Benefits */}
        <View
          style={[
            styles.benefitsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.benefitsTitle, { color: colors.foreground }]}>
            Everything in Pro
          </Text>
          <View style={styles.benefitsList}>
            {BENEFITS.map((b) => (
              <View key={b.text} style={styles.benefitRow}>
                <View style={styles.benefitIconWrap}>
                  <Feather name={b.icon} size={15} color="#4f46e5" />
                </View>
                <Text
                  style={[styles.benefitText, { color: colors.foreground }]}
                >
                  {b.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Free tier info */}
        <View
          style={[
            styles.freeCard,
            { backgroundColor: `${colors.mutedForeground}12`, borderColor: colors.border },
          ]}
        >
          <Feather name="info" size={13} color={colors.mutedForeground} />
          <Text style={[styles.freeText, { color: colors.mutedForeground }]}>
            Free plan: 2 subjects · 10 topics per subject
          </Text>
        </View>

        {/* Pricing cards — always show fallback INR prices if RevenueCat fails */}
        {offeringsLoading ? (
          <View style={[styles.pricingRow, { justifyContent: "center", paddingVertical: 28 }]}>
            <ActivityIndicator color="#4f46e5" />
          </View>
        ) : (
          <View style={styles.pricingRow}>
            {/* Annual */}
            <Pressable
              onPress={() => setSelectedPkg("annual")}
              style={[
                styles.pricingCard,
                {
                  backgroundColor: colors.card,
                  borderColor: selectedPkg === "annual" ? "#4f46e5" : colors.border,
                  borderWidth: selectedPkg === "annual" ? 2 : 1,
                },
              ]}
            >
              {annualSavingsPct !== null && annualSavingsPct > 0 ? (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsBadgeText}>
                    Save {annualSavingsPct}%
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.pricingPeriod, { color: colors.mutedForeground }]}>
                Annual
              </Text>
              <Text style={[styles.pricingPrice, { color: colors.foreground }]}>
                {annualPrice}
              </Text>
              <Text style={[styles.pricingNote, { color: colors.mutedForeground }]}>
                {`~₹${annualMonthlyEquiv.toFixed(0)}/mo`}
              </Text>
              {selectedPkg === "annual" ? (
                <View style={styles.selectedDot} />
              ) : null}
            </Pressable>

            {/* Monthly */}
            <Pressable
              onPress={() => setSelectedPkg("monthly")}
              style={[
                styles.pricingCard,
                {
                  backgroundColor: colors.card,
                  borderColor: selectedPkg === "monthly" ? "#4f46e5" : colors.border,
                  borderWidth: selectedPkg === "monthly" ? 2 : 1,
                },
              ]}
            >
              <Text style={[styles.pricingPeriod, { color: colors.mutedForeground }]}>
                Monthly
              </Text>
              <Text style={[styles.pricingPrice, { color: colors.foreground }]}>
                {monthlyPrice}
              </Text>
              <Text style={[styles.pricingNote, { color: colors.mutedForeground }]}>
                per month
              </Text>
              {selectedPkg === "monthly" ? (
                <View style={styles.selectedDot} />
              ) : null}
            </Pressable>
          </View>
        )}

        {/* Trial info from package metadata when available */}
        {chosenPkg?.product.introPrice ? (
          <View
            style={[
              styles.trialBanner,
              { backgroundColor: "#22d3ee18", borderColor: "#22d3ee40" },
            ]}
          >
            <Feather name="gift" size={13} color="#22d3ee" />
            <Text style={[styles.trialText, { color: "#22d3ee" }]}>
              {chosenPkg.product.introPrice.periodNumberOfUnits}-
              {chosenPkg.product.introPrice.periodUnit?.toLowerCase()} free trial
              · then {chosenPriceString}
            </Text>
          </View>
        ) : null}

        {errorMsg ? (
          <Text style={[styles.errorText, { color: colors.destructive ?? "#ef4444" }]}>
            {errorMsg}
          </Text>
        ) : null}

        {restoreSuccess ? (
          <Text style={[styles.successText]}>
            Purchases restored successfully!
          </Text>
        ) : null}

        {/* CTA */}
        <Pressable
          onPress={handlePurchase}
          disabled={isPurchasing || isRetryingStore}
          style={({ pressed }) => [
            styles.ctaBtn,
            { opacity: pressed || isPurchasing || isRetryingStore ? 0.85 : 1 },
          ]}
        >
          <LinearGradient
            colors={["#4f46e5", "#7c3aed"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            {isPurchasing || isRetryingStore ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.ctaBtnText}>
                  {isRetryingStore ? "Connecting to store…" : "Processing…"}
                </Text>
              </View>
            ) : (
              <Text style={styles.ctaBtnText}>
                {chosenPkg?.product.introPrice
                  ? "Start Free Trial"
                  : `Subscribe ${selectedPkg === "annual" ? "Yearly" : "Monthly"}`}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text style={[styles.legalText, { color: colors.mutedForeground }]}>
          Subscription auto-renews. Cancel anytime in your account settings.
        </Text>

        {/* Restore */}
        <Pressable
          onPress={handleRestore}
          disabled={isRestoring}
          style={({ pressed }) => [styles.restoreBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
              Restore purchases
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Purchase success modal */}
      <Modal
        visible={purchaseSuccess}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => { setPurchaseSuccess(false); router.back(); }}
      >
        <View style={styles.successBackdrop}>
          <Animated.View
            style={[
              styles.successCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              { opacity: successOpacity, transform: [{ scale: successScale }] },
            ]}
          >
            <LinearGradient
              colors={["#4f46e5", "#7c3aed"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successIconCircle}
            >
              <Feather name="check" size={36} color="#fff" />
            </LinearGradient>

            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              You're Pro!
            </Text>
            <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
              All Pro features are now unlocked and ready to use.
            </Text>

            <View style={[styles.successBenefitsBox, { backgroundColor: `${colors.mutedForeground}0e`, borderColor: colors.border }]}>
              {BENEFITS.map((b) => (
                <View key={b.text} style={styles.successBenefitRow}>
                  <Feather name="check-circle" size={14} color="#22c55e" />
                  <Text style={[styles.successBenefitText, { color: colors.foreground }]}>
                    {b.text}
                  </Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => { setPurchaseSuccess(false); router.back(); }}
              style={({ pressed }) => [
                styles.successCtaBtn,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <LinearGradient
                colors={["#4f46e5", "#7c3aed"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.successCtaGradient}
              >
                <Text style={styles.successCtaText}>Start Exploring</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      {/* Dev-only confirmation modal */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setConfirmVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setConfirmVisible(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  Test Purchase
                </Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  This is a test-store purchase for{" "}
                  <Text style={{ fontFamily: "Inter_700Bold" }}>
                    {chosenPkg?.product.title}
                  </Text>{" "}
                  at{" "}
                  <Text style={{ fontFamily: "Inter_700Bold" }}>
                    {chosenPriceString}
                  </Text>
                  . No real money will be charged.
                </Text>
                <View style={styles.modalBtns}>
                  <Pressable
                    onPress={() => setConfirmVisible(false)}
                    style={({ pressed }) => [
                      styles.modalCancel,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={doPurchase}
                    style={({ pressed }) => [
                      styles.modalConfirm,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={styles.modalConfirmText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 14 },
  hero: {
    borderRadius: 22,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: "#fff",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
  benefitsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  benefitsTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  benefitsList: { gap: 10 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#4f46e518",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    flex: 1,
  },
  freeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  freeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  pricingRow: { flexDirection: "row", gap: 12 },
  pricingCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 4,
    position: "relative",
    minHeight: 110,
    justifyContent: "center",
  },
  savingsBadge: {
    position: "absolute",
    top: -10,
    backgroundColor: "#22d3ee",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  savingsBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#0b1020",
  },
  pricingPeriod: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  pricingPrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  pricingNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4f46e5",
    marginTop: 6,
  },
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  trialText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  successText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#22c55e",
    textAlign: "center",
  },
  ctaBtn: { borderRadius: 16, overflow: "hidden" },
  ctaGradient: {
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.2,
  },
  legalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  restoreBtn: { alignItems: "center", paddingVertical: 6 },
  restoreText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.80)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    alignItems: "center",
    gap: 14,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  successSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  successBenefitsBox: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginTop: 2,
  },
  successBenefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  successBenefitText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  successCtaBtn: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  successCtaGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  successCtaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
    letterSpacing: 0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,7,18,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    gap: 14,
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  modalSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  modalBtns: { flexDirection: "row", gap: 10, width: "100%", marginTop: 4 },
  modalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  modalCancelText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  modalConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#4f46e5",
    alignItems: "center",
  },
  modalConfirmText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  retryText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  retryBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  retryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});
