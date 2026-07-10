"use client";

import { getOnboardingState } from "@/lib/onboarding/store";
import { recordJobUsage } from "@/lib/user-profile/learning";
import { loadUserWorkProfile, updateUserWorkProfile } from "@/lib/user-profile/store";
import type { JobCategoryId, UserWorkProfile } from "@/lib/user-profile/types";

import { getFirstExperienceTask } from "./tasks";
import type { FirstExperienceResult } from "./types";

export function completeFirstExperience(result: FirstExperienceResult): void {
  const task = getFirstExperienceTask(result.taskId);
  for (let i = 0; i < 5; i += 1) {
    recordJobUsage({
      text: task.assignment,
      label: result.deliverable.title,
    });
  }

  const onboarding = getOnboardingState();
  updateUserWorkProfile({
    onboarding: {
      ...onboarding,
      firstExperienceCompleted: true,
      firstExperienceDate: new Date().toISOString(),
      firstTaskCategory: result.jobCategory,
      firstTaskDuration: result.durationSec,
      firstExperienceDeferred: false,
      firstExperienceTaskId: result.taskId,
    },
  });
}

export function deferFirstExperience(): void {
  const onboarding = getOnboardingState();
  updateUserWorkProfile({
    onboarding: {
      ...onboarding,
      firstExperienceDeferred: true,
      firstExperienceCompleted: false,
    },
  });
}

export function shouldShowFirstExperience(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  const onboarding = getOnboardingState(profile);
  if (!onboarding.completedOnboarding) return false;
  if (onboarding.firstExperienceCompleted) return false;
  if (onboarding.firstExperienceDeferred) return false;
  return true;
}

export function shouldShowFirstExperienceCard(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  const onboarding = getOnboardingState(profile);
  if (!onboarding.completedOnboarding) return false;
  return !onboarding.firstExperienceCompleted;
}

export function getFirstExperiencePriorityCategory(
  profile: UserWorkProfile = loadUserWorkProfile(),
): JobCategoryId | null {
  const onboarding = getOnboardingState(profile);
  return onboarding.firstTaskCategory ?? null;
}
