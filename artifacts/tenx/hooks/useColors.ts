import { useMemo } from "react";
import colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";

export function useColors() {
  const { settings } = useSettings();
  const isDark = settings.theme === "dark";
  return useMemo(() => {
    const palette = isDark
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
    return { ...palette, radius: colors.radius };
  }, [isDark]);
}
