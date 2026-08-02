import type { FeatureFlagId, FeatureFlagState } from "./types";

/**
 * Flags that ship with Automation First formal-home rollout.
 * Defaults are environment-aware so Preview / local show the new UI on `/projects`
 * without visiting `/dev`, while production stays staged (`beta`) until owner promote.
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
 * 3. Vercel Preview / non-production → on
 * 4. Production → beta (owners + ATLAS_BETA_USER_EMAILS)
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

  if (process.env.VERCEL_ENV === "preview") {
    return "on";
  }

  if (process.env.NODE_ENV !== "production") {
    return "on";
  }

  return "beta";
}
