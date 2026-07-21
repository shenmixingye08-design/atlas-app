import {
  THEME_STORAGE_KEY,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./types";

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return getSystemTheme();
  return preference;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme =
    resolved === "dark" ? "dark" : "light";
}

/** Inline boot script — prevents flash before React hydrates. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"&&p!=="system"&&p!=="light-warm")p="system";var t=p;if(p==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==="dark"?"dark":"light";}catch(e){}})();`;
