import type { FeatureFlagId, FeatureFlagState } from "./types";

/**
 * Flags that ship with Automation First formal-home rollout.
 * Defaults are environment-aware so `/projects` shows the new UI without `/dev`.
 * Rollback: Owner Feature Flags → off, or ATLAS_AUTOMATION_FIRST_UI=off /
 * NEXT_PUBLIC_ATLAS_AUTOMATION_FIRST_UI=off.
 */
export const AUTOMATION_FIRST_ROLLOUT_FLAG_IDS = [
  "automation_first_home_enabled",
  "automation_first_navigation_enabled",
  "automation_design_system_enabled",
  "automation_dashboard_v2_enabled",
  "automation_v2_enabled",
  "automation_operations_enabled",
] as const satisfies readonly FeatureFlagId[];

export type AutomationFirstRolloutFlagId =
  (typeof AUTOMATION_FIRST_ROLLOUT_FLAG_IDS)[number];

export function isAutomationFirstRolloutFlag(
  id: FeatureFlagId,
): id is AutomationFirstRolloutFlagId {
  return (AUTOMATION_FIRST_ROLLOUT_FLAG_IDS as readonly string[]).includes(id);
}

/**
 * Resolve default state for Automation First formal UI flags.
 *
 * Priority:
 * 1. `ATLAS_AUTOMATION_FIRST_UI` = on|off|beta
 * 2. Vitest → off (deterministic tests)
 * 3. All other environments (Preview / Development / Production) → on
 *    so normal login to `/projects` shows Automation First UI.
 */
export function resolveAutomationFirstDefaultState(): FeatureFlagState {
  const override = process.env.ATLAS_AUTOMATION_FIRST_UI?.trim().toLowerCase();
  if (override === "0" || override === "off" || override === "false") {
    return "off";
  }
  if (override === "1" || override === "on" || override === "true") {
    return "on";
  }
  if (override === "beta") {
    return "beta";
  }

  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return "off";
  }

  return "on";
}
