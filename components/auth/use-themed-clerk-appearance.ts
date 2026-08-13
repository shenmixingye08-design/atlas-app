"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { getAtlasClerkAppearance } from "@/lib/clerk/appearance";

/**
 * Clerk appearance for the current resolved MINERVOT theme.
 *
 * Uses the existing ThemeProvider. First render is light (provider default)
 * so SSR / hydration stay aligned; after mount it follows stored/system theme.
 */
export function useThemedClerkAppearance() {
  const { resolved } = useTheme();
  return getAtlasClerkAppearance(resolved);
}
