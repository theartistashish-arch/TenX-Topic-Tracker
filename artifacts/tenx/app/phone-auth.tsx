import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark, BrandWordmark } from "@/components/Brand";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const COUNTRY_CODES = [
  { label: "India", code: "+91", flag: "🇮🇳" },
  { label: "USA", code: "+1", flag: "🇺🇸" },
  { label: "UK", code: "+44", flag: "🇬🇧" },
  { label: "UAE", code: "+971", flag: "🇦🇪" },
  { label: "Canada", code: "+1", flag: "🇨🇦" },
  { label: "Australia", code: "+61", flag: "🇦🇺" },
  { label: "Singapore", code: "+65", flag: "🇸🇬" },
];

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;

export default function PhoneAuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sendOtp, verifyOtp, isNewUser } = useAuth();

  const [step, setStep] = useState<"phone" | "otp">("phone");

  const [countryIdx, setCountryIdx] = useState(0);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState("");

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(RESEND_COOLDOWN_SEC);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const fullPhone = `${COUNTRY_CODES[countryIdx]!.code}${phone.replace(/\s/g, "")}`;

  const handleSendOtp = async () => {
    setError(null);
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }
    setSubmitting(true);
    const res = await sendOtp(fullPhone);
    setSubmitting(false);
    if (res.ok) {
      setStep("otp");
      startCountdown();
    } else {
      setError(res.error);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError(null);
    setOtp(Array(OTP_LENGTH).fill(""));
    otpRefs.current[0]?.focus();
    setSubmitting(true);
    const res = await sendOtp(fullPhone);
    setSubmitting(false);
    if (res.ok) {
      startCountdown();
    } else {
      setError(res.error);
    }
  };

  const handleOtpChange = (val: string, idx: number) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < OTP_LENGTH - 1) {
      otpRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => d !== "") && next.join("").length === OTP_LENGTH) {
      handleVerify(next.join(""));
    }
  };

  const handleOtpKeyPress = (key: string, idx: number) => {
    if (key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const finalCode = code ?? otp.join("");
    if (finalCode.length !== OTP_LENGTH) {
      setError("Please enter all 6 digits.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await verifyOtp(finalCode);
    setSubmitting(false);
    if (res.ok) {
      if (isNewUser) {
        router.replace("/about");
      } else {
        router.replace("/home");
      }
    } else {
      setError(res.error);
      setOtp(Array(OTP_LENGTH).fill(""));
      otpRefs.current[0]?.focus();
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topInset + 16, paddingBottom: bottomInset + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomInset + 32}
      >
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => {
              if (step === "otp") {
                setStep("phone");
                setOtp(Array(OTP_LENGTH).fill(""));
                setError(null);
              } else {
                router.back();
              }
            }}
            hitSlop={12}
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.brandRow}>
          <BrandMark size={48} />
          <BrandWordmark size={22} color={colors.foreground} />
        </View>

        {step === "phone" ? (
          <>
            <View style={styles.heroBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>Phone sign-in</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                We'll send a 6-digit code to verify your number.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Phone number</Text>
                <View style={styles.phoneRow}>
                  <Pressable
                    onPress={() => setShowCountryPicker((v) => !v)}
                    style={({ pressed }) => [
                      styles.countryBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.flagText}>{COUNTRY_CODES[countryIdx]!.flag}</Text>
                    <Text style={[styles.codeText, { color: colors.foreground }]}>
                      {COUNTRY_CODES[countryIdx]!.code}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                  </Pressable>

                  <TextInput
                    style={[
                      styles.phoneInput,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        color: colors.foreground,
                      },
                    ]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="98765 43210"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    maxLength={15}
                  />
                </View>

                {showCountryPicker && (
                  <View
                    style={[
                      styles.countryList,
                      { borderColor: colors.border, backgroundColor: colors.card },
                    ]}
                  >
                    {COUNTRY_CODES.map((c, i) => (
                      <Pressable
                        key={`${c.flag}-${c.code}`}
                        onPress={() => {
                          setCountryIdx(i);
                          setShowCountryPicker(false);
                        }}
                        style={({ pressed }) => [
                          styles.countryItem,
                          i < COUNTRY_CODES.length - 1 && {
                            borderBottomColor: colors.border,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                          },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={styles.flagText}>{c.flag}</Text>
                        <Text style={[styles.countryName, { color: colors.foreground }]}>
                          {c.label}
                        </Text>
                        <Text style={[styles.codeText, { color: colors.mutedForeground }]}>
                          {c.code}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {error ? (
                <Text style={[styles.errorBanner, { color: colors.destructive }]}>{error}</Text>
              ) : null}

              <PrimaryButton title="Send OTP" onPress={handleSendOtp} loading={submitting} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.heroBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>Enter OTP</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                A 6-digit code was sent to {fullPhone}
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.otpRow}>
                {otp.map((digit, idx) => (
                  <TextInput
                    key={idx}
                    ref={(r) => {
                      otpRefs.current[idx] = r;
                    }}
                    style={[
                      styles.otpBox,
                      {
                        borderColor: digit ? colors.primary : colors.border,
                        backgroundColor: colors.card,
                        color: colors.foreground,
                      },
                    ]}
                    value={digit}
                    onChangeText={(val) => handleOtpChange(val, idx)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, idx)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    textAlign="center"
                  />
                ))}
              </View>

              {error ? (
                <Text style={[styles.errorBanner, { color: colors.destructive }]}>{error}</Text>
              ) : null}

              <PrimaryButton
                title="Verify"
                onPress={() => handleVerify()}
                loading={submitting}
              />

              <View style={styles.resendRow}>
                {countdown > 0 ? (
                  <Text style={[styles.countdownText, { color: colors.mutedForeground }]}>
                    Resend code in{" "}
                    <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
                      {countdown}s
                    </Text>
                  </Text>
                ) : (
                  <Pressable
                    onPress={handleResend}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text style={[styles.resendText, { color: colors.primary }]}>Resend code</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      {isWeb && <View nativeID="recaptcha-container" />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    gap: 24,
  },
  headerBar: {
    marginBottom: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroBlock: { gap: 8 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  form: { gap: 16 },
  fieldGroup: { gap: 8 },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  flagText: {
    fontSize: 20,
  },
  codeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  phoneInput: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  countryList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  countryName: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  errorBanner: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  resendRow: {
    alignItems: "center",
    paddingTop: 4,
  },
  countdownText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  resendText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
