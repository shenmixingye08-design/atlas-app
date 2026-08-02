"use client";

import { useEffect } from "react";

import { useFeatureAvailability } from "@/lib/feature-flags";

/**
 * Applies `html.automation-design-system` when the design-system flag is on.
 * Safe no-op when flag is off or still loading (defaults to not applying).
 */
export function AutomationDesignSystemRoot() {
  const { flags, loading } = useFeatureAvailability();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const enabled = !loading && flags.automation_design_system_enabled === true;
    document.documentElement.classList.toggle("automation-design-system", enabled);
    return () => {
      document.documentElement.classList.remove("automation-design-system");
    };
  }, [flags.automation_design_system_enabled, loading]);

  return null;
}
