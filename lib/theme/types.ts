/** Theme preference stored in localStorage. */
export type ThemePreference = "light" | "dark" | "system" | "light-warm";

/** Resolved visual theme applied to the document. */
export type ResolvedTheme = "light" | "dark" | "light-warm";

export const THEME_STORAGE_KEY = "atlas-theme";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
  "light-warm",
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    value === "light" ||
    value === "dark" ||
    value === "system" ||
    value === "light-warm"
  );
}
