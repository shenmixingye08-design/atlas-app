import { HOME_FREQUENT_WORK_PRESETS } from "@/lib/home/frequent-work-presets";
import type { QuickRequestPreset } from "@/lib/workspace/quick-request-presets";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import { getExternalServiceDefinition } from "@/lib/integrations/external-services/registry";
import type { OnboardingTaskId, UserWorkProfile } from "@/lib/user-profile/types";
import type { ProactiveSuggestion } from "@/lib/proactive-suggestions/types";

import { getOnboardingState } from "./store";
import { getOnboardingTask } from "./tasks";
import { getFirstExperiencePriorityCategory } from "@/lib/first-experience/store";

export type RecommendedIntegration = {
  serviceId: ExternalServiceId;
  serviceName: string;
  icon: string;
  reason: string;
  href: string;
  taskId: OnboardingTaskId;
};

export type RecommendedAutomation = {
  id: string;
  label: string;
  description: string;
  href: string;
  taskId: OnboardingTaskId;
};

const SERVICE_SETTINGS_HREF: Partial<Record<ExternalServiceId, string>> = {
  google: "/settings/google/gmail",
  x: "/settings/x",
  wordpress: "/settings/wordpress",
  dropbox: "/workspace/drive?provider=dropbox",
};

export function getPreferredOnboardingTasks(
  profile: UserWorkProfile,
): OnboardingTaskId[] {
  const onboarding = getOnboardingState(profile);
  const firstTaskId = onboarding.firstExperienceTaskId;
  if (firstTaskId && firstTaskId !== "custom" && firstTaskId !== "undecided") {
    const fromExperience = firstTaskId as OnboardingTaskId;
    const rest = onboarding.preferredTasks.filter(
      (id) => id !== "undecided" && id !== fromExperience,
    );
    return [fromExperience, ...rest];
  }

  const firstCategory = getFirstExperiencePriorityCategory(profile);
  if (firstCategory) {
    const fromCategory: OnboardingTaskId | null =
      firstCategory === "sns_post"
        ? "sns"
        : firstCategory === "blog"
          ? "blog"
          : firstCategory === "sales_material"
            ? "sales_material"
            : firstCategory === "email"
              ? "email"
              : firstCategory === "file_organize"
                ? "files"
                : null;
    if (fromCategory) {
      const rest = onboarding.preferredTasks.filter(
        (id) => id !== "undecided" && id !== fromCategory,
      );
      return [fromCategory, ...rest];
    }
  }

  const tasks = onboarding.preferredTasks.filter((id) => id !== "undecided");
  if (tasks.length > 0) return tasks;

  return profile.frequentlyUsedJobs.slice(0, 3).map((job) => {
    if (job.jobCategory === "sns_post") return "sns";
    if (job.jobCategory === "blog") return "blog";
    if (job.jobCategory === "sales_material") return "sales_material";
    if (job.jobCategory === "email") return "email";
    if (job.jobCategory === "file_organize") return "files";
    return "company";
  });
}

export function sortFrequentWorkPresets(
  profile: UserWorkProfile,
): readonly QuickRequestPreset[] {
  const preferred = getPreferredOnboardingTasks(profile);
  const presetOrder = preferred
    .map((taskId) => getOnboardingTask(taskId).presetId)
    .filter(Boolean) as string[];

  return [...HOME_FREQUENT_WORK_PRESETS].sort((a, b) => {
    const aIndex = presetOrder.indexOf(a.id);
    const bIndex = presetOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function getRecommendedIntegrations(
  profile: UserWorkProfile,
): RecommendedIntegration[] {
  const tasks = getPreferredOnboardingTasks(profile);
  const seen = new Set<ExternalServiceId>();
  const results: RecommendedIntegration[] = [];

  for (const taskId of tasks) {
    const task = getOnboardingTask(taskId);
    for (const serviceId of task.recommendedServices) {
      if (seen.has(serviceId)) continue;
      seen.add(serviceId);

      const definition = getExternalServiceDefinition(serviceId);
      results.push({
        serviceId,
        serviceName: definition.serviceName,
        icon: definition.icon,
        reason: `${task.label}に最適`,
        href: task.settingsHref ?? SERVICE_SETTINGS_HREF[serviceId] ?? "/settings",
        taskId,
      });
    }
  }

  return results.slice(0, 4);
}

export function getRecommendedAutomations(
  profile: UserWorkProfile,
): RecommendedAutomation[] {
  const tasks = getPreferredOnboardingTasks(profile);

  return tasks
    .filter((taskId) => {
      const task = getOnboardingTask(taskId);
      return Boolean(task.automationHint);
    })
    .map((taskId) => {
      const task = getOnboardingTask(taskId);
      return {
        id: `onboarding-auto:${taskId}`,
        label: task.automationHint ?? task.label,
        description: `${task.label}の定期実行をおすすめします`,
        href: `/automations?create=1&task=${taskId}`,
        taskId,
      };
    })
    .slice(0, 3);
}

/** Boost proactive suggestions that match onboarding preferences. */
export function applyOnboardingPriorityBoost(
  suggestions: ProactiveSuggestion[],
  profile: UserWorkProfile,
): ProactiveSuggestion[] {
  const tasks = getPreferredOnboardingTasks(profile);
  if (tasks.length === 0) return suggestions;

  const keywords = tasks.flatMap((taskId) => {
    const task = getOnboardingTask(taskId);
    return [task.label, task.seedText, task.automationHint ?? ""];
  });

  return suggestions
    .map((suggestion) => {
      const text = `${suggestion.message} ${suggestion.automationName ?? ""}`;
      const matches = keywords.some(
        (keyword) => keyword.length > 0 && text.includes(keyword),
      );
      return matches
        ? { ...suggestion, priority: suggestion.priority + 25 }
        : suggestion;
    })
    .sort((a, b) => b.priority - a.priority);
}
