"use client";

import { useEffect } from "react";

import { useFeatureAvailability } from "@/lib/feature-flags";
import { resolveClientAutomationFirstPreferOn } from "@/lib/feature-flags/client-rollout";

/**
 * Applies `html.automation-design-system` when the design-system flag is on.
 * While flags load, prefer-on client default applies to avoid gold CTA flash.
 */
export function AutomationDesignSystemRoot() {
  const { flags, loading } = useFeatureAvailability();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const preferOn = resolveClientAutomationFirstPreferOn();
    const enabled = loading
      ? preferOn
      : flags.automation_design_system_enabled === true;
    document.documentElement.classList.toggle(
      "automation-design-system",
      enabled,
    );
    return () => {
      document.documentElement.classList.remove("automation-design-system");
    };
  }, [flags.automation_design_system_enabled, loading]);

  return null;
}
