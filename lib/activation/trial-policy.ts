import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { TrialPolicy, TrialPolicyMode } from "./types";
import { TRIAL_POLICY_MODES } from "./types";

export const DEFAULT_TRIAL_FIXED_DAYS = 14;

function parseMode(value: string | undefined): TrialPolicyMode {
  if (value && (TRIAL_POLICY_MODES as readonly string[]).includes(value)) {
    return value as TrialPolicyMode;
  }
  return "single_success";
}

/**
 * Existing product behavior is the default: one Free success, no timed trial.
 * `fixed_days` can be stored but is never applied in production.
 */
export function resolveTrialPolicy(
  env: NodeJS.ProcessEnv = process.env,
): TrialPolicy {
  const configuredMode = parseMode(env.ATLAS_TRIAL_POLICY);
  const fixedDaysRaw = Number(env.ATLAS_TRIAL_FIXED_DAYS);
  const fixedDays =
    Number.isFinite(fixedDaysRaw) && fixedDaysRaw > 0
      ? Math.min(90, Math.floor(fixedDaysRaw))
      : DEFAULT_TRIAL_FIXED_DAYS;

  if (configuredMode === "disabled") {
    return {
      mode: "disabled",
      configuredMode,
      appliedInProduction: true,
      fixedDays,
    };
  }

  if (configuredMode === "fixed_days") {
    const allowFixedDays =
      !isAtlasProduction() && env.ATLAS_TRIAL_ALLOW_FIXED_DAYS === "1";
    return {
      mode: allowFixedDays ? "fixed_days" : "single_success",
      configuredMode,
      appliedInProduction: allowFixedDays,
      fixedDays,
    };
  }

  return {
    mode: "single_success",
    configuredMode: "single_success",
    appliedInProduction: true,
    fixedDays,
  };
}
