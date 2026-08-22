"use client";

import { getOnboardingState } from "@/lib/onboarding/store";
import { loadUserWorkProfile } from "@/lib/user-profile/store";
import type { UserWorkProfile } from "@/lib/user-profile/types";

/**
 * First-run clarity: hide advanced controls until the user has finished
 * one real success path (first experience or any completed onboarding path).
 */
export function isClarityFirstRun(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  const onboarding = getOnboardingState(profile);
  if (!onboarding.completedOnboarding) return true;
  return onboarding.firstExperienceCompleted !== true;
}

/** Show Word/Excel/PowerPoint/PDF format picker only after first success. */
export function shouldShowDeliverableFormatPicker(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  return !isClarityFirstRun(profile);
}

/** Show attachment panel expanded only after first success (or when needed). */
export function shouldShowAdvancedRequestControls(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  return !isClarityFirstRun(profile);
}

/** First-run X setup: theme + time only. Advanced settings come later. */
export function shouldShowXAutopostAdvancedControls(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  return !isClarityFirstRun(profile);
}
