"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  applyResolvedTheme,
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
} from "@/lib/theme/storage";
import type { ResolvedTheme, ThemePreference } from "@/lib/theme/types";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggleLightDark: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const TRANSITION_MS = 250;

function runThemeTransition(apply: () => void) {
  const root = document.documentElement;
  root.dataset.themeTransitioning = "true";
  apply();
  window.setTimeout(() => {
    delete root.dataset.themeTransitioning;
  }, TRANSITION_MS);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredThemePreference();
    const nextResolved = resolveTheme(stored);
    setPreferenceState(stored);
    setResolved(nextResolved);
    applyResolvedTheme(nextResolved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolveTheme("system");
      runThemeTransition(() => {
        setResolved(next);
        applyResolvedTheme(next);
      });
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference, ready]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredThemePreference(next);
    const nextResolved = resolveTheme(next);
    runThemeTransition(() => {
      setPreferenceState(next);
      setResolved(nextResolved);
      applyResolvedTheme(nextResolved);
    });
  }, []);

  const toggleLightDark = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
      toggleLightDark,
    }),
    [preference, resolved, setPreference, toggleLightDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
