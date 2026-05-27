import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark, BrandWordmark } from "@/components/Brand";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  const handleSend = async () => {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    setSubmitting(true);
    const res = await sendPasswordReset(trimmed);
    setSubmitting(false);
    if (res.ok) {
      setSent(true);
    } else {
      setError(res.error);
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
            onPress={() => router.back()}
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

        {sent ? (
          <View style={styles.successBlock}>
            <View style={[styles.successIconWrap, { backgroundColor: colors.primary + "20" }]}>
              <Feather name="mail" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Check your inbox</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              We sent a password-reset link to{" "}
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                {email.trim().toLowerCase()}
              </Text>
              . Follow the link in the email to set a new password.
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backToLogin,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.backToLoginText, { color: colors.foreground }]}>
                Back to sign in
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.heroBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>Forgot password?</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Enter the email you signed up with and we'll send you a reset link.
              </Text>
            </View>

            <View style={styles.form}>
              <FormField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />

              {error ? (
                <Text style={[styles.errorBanner, { color: colors.destructive }]}>{error}</Text>
              ) : null}

              <PrimaryButton title="Send reset link" onPress={handleSend} loading={submitting} />
            </View>
          </>
        )}
      </KeyboardAwareScrollView>
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
    lineHeight: 22,
  },
  form: { gap: 16 },
  errorBanner: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  successBlock: {
    gap: 16,
    alignItems: "center",
    paddingTop: 16,
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  backToLogin: {
    marginTop: 8,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    alignSelf: "stretch",
  },
  backToLoginText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
