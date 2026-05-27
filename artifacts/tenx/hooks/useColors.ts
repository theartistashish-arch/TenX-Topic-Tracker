import colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";

/**
 * Returns the design tokens for the current color scheme.
 * Follows the user's explicit "light" or "dark" preference from Settings.
 */
export function useColors() {
  const { settings } = useSettings();

  const palette =
    settings.theme === "dark" && "dark" in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;

  return { ...palette, radius: colors.radius };
}
