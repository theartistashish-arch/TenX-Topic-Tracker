import { Feather } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark, BrandTagline, BrandWordmark } from "@/components/Brand";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isWeb = Platform.OS === "web";
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    if (currentUser) {
      router.replace("/about");
    }
  }, [currentUser]);

  const handleContinue = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await signUp(email, password, name);
      if (!res.ok) {
        Alert.alert(
          "Signup failed",
          res.error ?? "Something went wrong. Please try again.",
          [{ text: "OK", onPress: () => {} }]
        );
      }
      // AuthContext's onAuthStateChanged will trigger the useEffect above
      // and auto-navigate to /about when currentUser becomes non-null.
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: topInset + 24,
            paddingBottom: bottomInset + 32,
            justifyContent: "center",
            flexGrow: 1,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomInset + 32}
      >
        <View style={styles.brandRow}>
          <BrandMark size={52} />
          <View style={{ gap: 2 }}>
            <BrandWordmark size={24} color={colors.foreground} />
            <BrandTagline color={colors.mutedForeground} />
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Create your account
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Join Topter and start studying smarter.
          </Text>
        </View>

        <View style={styles.form}>
          <FormField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Aarav Sharma"
            autoCapitalize="words"
          />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry={!showPassword}
            right={
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10}>
                <Feather name={showPassword ? "eye" : "eye-off"} size={20} color={colors.mutedForeground} />
              </Pressable>
            }
          />
          <FormField
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            secureTextEntry={!showConfirm}
            right={
              <Pressable onPress={() => setShowConfirm((s) => !s)} hitSlop={10}>
                <Feather name={showConfirm ? "eye" : "eye-off"} size={20} color={colors.mutedForeground} />
              </Pressable>
            }
          />

          {error ? (
            <Text style={[styles.errorBanner, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <PrimaryButton title="Continue" onPress={handleContinue} loading={loading} disabled={loading} />
        </View>

        <View style={styles.footerRow}>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
            Already have an account?{" "}
          </Text>
          <Link href="/login" replace>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
              Sign in
            </Text>
          </Link>
        </View>
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
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroBlock: { gap: 6 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  form: { gap: 16 },
  errorBanner: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
});
