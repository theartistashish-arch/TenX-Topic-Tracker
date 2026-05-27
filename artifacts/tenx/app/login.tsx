import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
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

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const topInset = insets.top;
  const bottomInset = insets.bottom;

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: topInset + 24,
            paddingBottom: bottomInset + 24,
            justifyContent: "center",
            flexGrow: 1,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={bottomInset + 24}
      >
        <View style={styles.brandRow}>
          <BrandMark size={56} />
          <View style={{ gap: 2 }}>
            <BrandWordmark size={26} color={colors.foreground} />
            <BrandTagline color={colors.mutedForeground} />
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to keep your learning streak alive.
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
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              Forgot password?
            </Text>
          </Pressable>

          {error ? (
            <Text style={[styles.errorBanner, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            title="Sign in"
            onPress={handleEmailLogin}
            loading={submitting}
          />
        </View>

        <View style={styles.footerRow}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: "Inter_500Medium",
            }}
          >
            New to Topter?{" "}
          </Text>
          <Link href="/signup" replace>
            <Text
              style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}
            >
              Create an account
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
    gap: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroBlock: { gap: 8 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
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
  },
});
