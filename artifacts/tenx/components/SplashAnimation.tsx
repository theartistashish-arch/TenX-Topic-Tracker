import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

interface SplashAnimationProps {
  onFinish: () => void;
}

/**
 * Minimal splash: static icon + tagline shown for ~1.2s,
 * then a single fade-out. No reanimated or complex animations
 * so all Android devices work reliably on cold start.
 * Uses flexbox for responsiveness on any screen size (phones, foldables, tablets).
 */
export function SplashAnimation({ onFinish }: SplashAnimationProps) {
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const [visible, setVisible] = useState(true);
  const { width, height } = useWindowDimensions();

  // Icon scales to ~28% of the smaller screen dimension so it looks good
  // on phones, foldables, and tablets.
  const iconSize = Math.round(Math.min(width, height) * 0.28);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false, // JS driver avoids any native module dependency issues
      }).start(() => {
        setVisible(false);
        onFinish();
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [onFinish, screenOpacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <View style={styles.content}>
        <View style={styles.centerBlock}>
          <Image
            source={require("../assets/images/icon.png")}
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize * 0.22,
              marginBottom: 28,
            }}
            resizeMode="contain"
          />
          <View style={styles.textBlock}>
            <Text style={styles.appName}>Topter</Text>
            <Text style={styles.tagline}>Track, Revise, Remember</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0a0a0f",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centerBlock: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: "-12%",
  },
  textBlock: {
    alignItems: "center",
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.5,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  tagline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
});
