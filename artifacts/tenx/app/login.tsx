import { AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithEmail, signInWithGoogle, signInWithGoogleCredential } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailLogin = async () => {
    setError(null);
    setSubmitting(true);
    const res = await signInWithEmail(email, password);
    setSubmitting(false);
    if (res.ok) {
      router.replace("/home");
    } else {
      setError(res.error);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (Platform.OS === "web") {
        const res = await signInWithGoogle();
        if (res.ok) {
          router.replace("/home");
        } else if (res.error !== "Sign-in cancelled.") {
          setError(res.error);
        }
      } else {
        await GoogleSignin.hasPlayServices();
        const result = await GoogleSignin.signIn();
        const idToken = result?.data?.idToken ?? result?.idToken;
        if (!idToken) throw new Error("No ID token returned.");
        const res = await signInWithGoogleCredential(idToken);
        if (res.ok) {
          router.replace("/home");
        } else {
          setError(res.error);
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code !== statusCodes.SIGN_IN_CANCELLED) {
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
            justifyContent: "center",
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={insets.bottom + 24}
      >
        {/* Logo */}
        <View style={styles.logoBlock}>
          <BrandMark size={76} />
          <BrandWordmark size={26} color="#0f172a" />
          <BrandTagline color="#64748b" />
        </View>

        {/* Hero */}
        <View style={styles.heroBlock}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to keep your learning streak alive.
          </Text>
        </View>

        {/* Google button */}
        <Pressable
          onPress={handleGoogleSignIn}
          disabled={googleLoading || submitting}
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
            placeholder="Your password"
            secureTextEntry
          />

          <Pressable
            onPress={() => router.push("/forgot-password")}
            style={({ pressed }) => ({
              alignSelf: "flex-end",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton
            title="Sign in"
            onPress={handleEmailLogin}
            loading={submitting}
          />
        </View>

        {/* Footer */}
        <View style={styles.footerDivider} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>New to Topter?{" "}</Text>
          <Link href="/signup" replace>
            <Text style={styles.footerLink}>Create an account</Text>
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
    gap: 24,
  },
  logoBlock: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
  },
  heroBlock: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
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
  forgotText: {
    color: "#3b82f6",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
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
