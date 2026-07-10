"use client";

import {
  loadUserWorkProfile,
  saveUserWorkProfile,
  updateUserWorkProfile,
} from "@/lib/user-profile/store";
import type {
  OnboardingEntryMode,
  OnboardingTaskId,
  UserOnboardingState,
  UserWorkProfile,
} from "@/lib/user-profile/types";

import { DEFAULT_ONBOARDING_STATE } from "./normalize";

export { DEFAULT_ONBOARDING_STATE, normalizeOnboardingState } from "./normalize";

export function getOnboardingState(
  profile: UserWorkProfile = loadUserWorkProfile(),
): UserOnboardingState {
  return profile.onboarding ?? DEFAULT_ONBOARDING_STATE;
}

export function shouldShowWelcomeWizard(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  const onboarding = getOnboardingState(profile);
  if (onboarding.completedOnboarding) return false;

  // Existing users with learned preferences are treated as onboarded.
  if (!profile.onboarding && profile.frequentlyUsedJobs.length > 0) {
    return false;
  }

  return onboarding.showOnboarding;
}

export function deferOnboarding(): UserWorkProfile {
  return updateUserWorkProfile({
    onboarding: {
      ...getOnboardingState(),
      showOnboarding: true,
      completedOnboarding: false,
      entryMode: "later",
      deferredAt: new Date().toISOString(),
    },
  });
}

export function completeOnboarding(input: {
  preferredTasks: OnboardingTaskId[];
  entryMode: OnboardingEntryMode;
}): UserWorkProfile {
  const current = getOnboardingState();
  const createdAt = current.createdAt ?? new Date().toISOString();

  return updateUserWorkProfile({
    onboarding: {
      showOnboarding: false,
      completedOnboarding: true,
      preferredTasks: input.preferredTasks,
      createdAt,
      entryMode: input.entryMode,
      deferredAt: null,
    },
  });
}

export function resetOnboardingForRedo(): UserWorkProfile {
  const profile = loadUserWorkProfile();
  const next: UserWorkProfile = {
    ...profile,
    onboarding: {
      showOnboarding: true,
      completedOnboarding: false,
      preferredTasks: [],
      createdAt: profile.onboarding?.createdAt ?? null,
      deferredAt: null,
      firstExperienceCompleted: false,
      firstExperienceDate: null,
      firstTaskCategory: null,
      firstTaskDuration: null,
      firstExperienceDeferred: false,
      firstExperienceTaskId: null,
    },
    updatedAt: new Date().toISOString(),
  };
  saveUserWorkProfile(next);
  return next;
}
