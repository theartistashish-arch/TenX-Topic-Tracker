import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  trackColor?: string;
  fillColor?: string;
  thumbColor?: string;
  style?: ViewStyle;
}

const THUMB = 24;

export function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
  trackColor = "rgba(255,255,255,0.16)",
  fillColor = "#22d3ee",
  thumbColor = "#ffffff",
  style,
}: RangeSliderProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [min, max],
  );

  const snap = useCallback(
    (n: number) => {
      const stepped = Math.round((n - min) / step) * step + min;
      return clamp(Math.round(stepped));
    },
    [min, step, clamp],
  );

  const valueFromX = useCallback(
    (x: number) => {
      const w = widthRef.current;
      if (w <= 0) return min;
      const usable = Math.max(1, w - THUMB);
      const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
      return snap(min + ratio * (max - min));
    },
    [min, max, snap],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const lastEmitted = useRef(value);
  const updateFromTouch = useCallback(
    (locationX: number) => {
      const next = valueFromX(locationX);
      if (next !== lastEmitted.current) {
        lastEmitted.current = next;
        onChange(next);
      }
    },
    [valueFromX, onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          updateFromTouch(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          updateFromTouch(e.nativeEvent.locationX);
        },
      }),
    [updateFromTouch],
  );

  const ratio = (clamp(value) - min) / (max - min || 1);
  const thumbX = (width - THUMB) * Math.min(1, Math.max(0, ratio));

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrap, style]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.track, { backgroundColor: trackColor }]} />
      <View
        style={[
          styles.fill,
          { width: thumbX + THUMB / 2, backgroundColor: fillColor },
        ]}
      />
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: thumbColor,
            transform: [{ translateX: thumbX }],
            borderColor: fillColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 36,
    width: "100%",
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: 3,
    width: "100%",
  },
  fill: {
    position: "absolute",
    left: 0,
    height: 6,
    borderRadius: 3,
  },
  thumb: {
    position: "absolute",
    left: 0,
    top: (36 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
