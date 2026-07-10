"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { getAtlasClerkAppearance } from "@/lib/clerk/appearance";

function ThemedClerkProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();

  return (
    <ClerkProvider appearance={getAtlasClerkAppearance(resolved)}>
      {children}
    </ClerkProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ThemedClerkProvider>{children}</ThemedClerkProvider>
    </ThemeProvider>
  );
}
