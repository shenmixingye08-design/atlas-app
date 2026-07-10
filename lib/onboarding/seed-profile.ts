import { inferJobCategory, getJobCategoryLabel } from "@/lib/user-profile/categories";
import { recordJobUsage } from "@/lib/user-profile/learning";
import { loadUserWorkProfile, saveUserWorkProfile } from "@/lib/user-profile/store";
import type { OnboardingTaskId, UserWorkProfile } from "@/lib/user-profile/types";

import { getOnboardingTask } from "./tasks";

const ONBOARDING_SEED_COUNT = 8;

/** Seed work profile from onboarding choices — high initial weight for home/suggestions. */
export function seedProfileFromOnboarding(tasks: OnboardingTaskId[]): UserWorkProfile {
  const actionable = tasks.filter((id) => id !== "undecided");

  for (const taskId of actionable) {
    const task = getOnboardingTask(taskId);
    if (!task.seedText) continue;

    const defaults =
      taskId === "sales_material"
        ? { preferredFormat: "pptx" as const }
        : taskId === "sns"
          ? { preferredHour: 18, preferredMinute: 0, frequency: "daily" as const }
          : {};

    for (let i = 0; i < ONBOARDING_SEED_COUNT; i += 1) {
      recordJobUsage({
        text: task.seedText,
        label: task.label,
        ...defaults,
      });
    }
  }

  return bumpFrequentJobsFromTasks(actionable);
}

function bumpFrequentJobsFromTasks(tasks: OnboardingTaskId[]): UserWorkProfile {
  const profile = loadUserWorkProfile();
  const jobs = [...profile.frequentlyUsedJobs];

  for (const taskId of tasks) {
    const task = getOnboardingTask(taskId);
    const category = task.jobCategory ?? inferJobCategory(task.seedText);
    const label = task.label || getJobCategoryLabel(category);
    const existing = jobs.find((item) => item.jobCategory === category);

    if (existing) {
      existing.count = Math.max(existing.count, ONBOARDING_SEED_COUNT);
      existing.label = label;
      existing.lastUsedAt = new Date().toISOString();
    } else {
      jobs.unshift({
        jobCategory: category,
        label,
        count: ONBOARDING_SEED_COUNT,
        lastUsedAt: new Date().toISOString(),
      });
    }
  }

  const next: UserWorkProfile = {
    ...profile,
    frequentlyUsedJobs: jobs.sort((a, b) => b.count - a.count),
    updatedAt: new Date().toISOString(),
  };
  saveUserWorkProfile(next);
  return next;
}
