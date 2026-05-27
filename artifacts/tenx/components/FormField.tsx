import React, { forwardRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  right?: React.ReactNode;
}

export const FormField = forwardRef<TextInput, FormFieldProps>(
  ({ label, error, right, style, ...rest }, ref) => {
    const colors = useColors();
    return (
      <View style={styles.wrap}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <View style={{ position: "relative" }}>
          <TextInput
            ref={ref}
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: error ? colors.destructive : colors.border,
                color: colors.foreground,
                paddingRight: right ? 48 : 16,
              },
              style,
            ]}
            {...rest}
          />
          {right ? (
            <View style={styles.rightAccessory}>
              {right}
            </View>
          ) : null}
        </View>
        {error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : null}
      </View>
    );
  }
);
FormField.displayName = "FormField";

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 6,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  rightAccessory: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
