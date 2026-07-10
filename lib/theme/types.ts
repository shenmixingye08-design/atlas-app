/** Theme preference stored in localStorage. */
export type ThemePreference = "light" | "dark" | "system";

/** Resolved visual theme applied to the document. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "atlas-theme";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
