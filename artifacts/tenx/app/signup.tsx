import { AntDesign, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { GoogleSignin, statusCodes } from "@/lib/googleSignIn";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, signUp, signInWithGoogle, signInWithGoogleCredential } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      router.replace("/about");
    }
  }, [currentUser, router]);

  const handleContinue = async () => {
    setError(null);
    if (!name.trim()) { setError("Please enter your full name."); return; }
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await signUp(email, password, name);
      if (!res.ok) {
        Alert.alert("Signup failed", res.error ?? "Something went wrong. Please try again.", [
          { text: "OK" },
        ]);
      }
      // onAuthStateChanged will update currentUser → useEffect navigates to /about
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (Platform.OS === "web") {
        const res = await signInWithGoogle();
        if (!res.ok && res.error !== "Sign-in cancelled.") setError(res.error);
      } else {
        await GoogleSignin.hasPlayServices();
        const result = await GoogleSignin.signIn();
        const idToken = result?.data?.idToken ?? result?.idToken;
        if (!idToken) throw new Error("No ID token returned.");
        const res = await signInWithGoogleCredential(idToken);
        if (!res.ok) setError(res.error);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code !== statusCodes.SIGN_IN_CANCELLED) {
        // DEBUG: show full error details on device
        Alert.alert(
          "Google Sign-In Error [DEBUG]",
          `code: ${code}\nmessage: ${(err as { message?: string }).message ?? ""}\n\n${JSON.stringify(err, null, 2)}`,
        );
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#f0f7ff", "#ffffff"]} style={styles.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 44,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={insets.bottom + 32}
      >
        {/* Logo */}
        <View style={styles.logoBlock}>
          <BrandMark size={76} />
          <BrandWordmark size={26} color="#0f172a" />
          <BrandTagline color="#64748b" />
        </View>

        {/* Hero */}
        <View style={styles.heroBlock}>
          <Text style={styles.title}>Start your study journey</Text>
          <Text style={styles.subtitle}>Join Topter and start studying smarter.</Text>
        </View>

        {/* Google button */}
        <Pressable
          onPress={handleGoogleSignIn}
          disabled={googleLoading || loading}
          style={({ pressed }) => [
            styles.googleButton,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <>
              <AntDesign name="google" size={20} color="#EA4335" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        {/* OR divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Form */}
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
                <Feather
                  name={showPassword ? "eye" : "eye-off"}
                  size={20}
                  color="#94a3b8"
                />
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
                <Feather
                  name={showConfirm ? "eye" : "eye-off"}
                  size={20}
                  color="#94a3b8"
                />
              </Pressable>
            }
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton
            title="Continue"
            onPress={handleContinue}
            loading={loading}
            disabled={loading}
          />
        </View>

        {/* Footer */}
        <View style={styles.footerDivider} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account?{" "}</Text>
          <Link href="/login" replace>
            <Text style={styles.footerLink}>Sign in</Text>
          </Link>
        </View>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    gap: 22,
  },
  logoBlock: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
  },
  heroBlock: {
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.8,
    color: "#0f172a",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    height: 52,
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  googleButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#0f172a",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  dividerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#94a3b8",
    letterSpacing: 2,
  },
  form: { gap: 14 },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#ef4444",
  },
  footerDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginTop: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
    paddingBottom: 8,
  },
  footerText: {
    color: "#475569",
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  footerLink: {
    color: "#3b82f6",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
});
