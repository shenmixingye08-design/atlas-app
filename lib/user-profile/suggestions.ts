import type { AutomationFormState } from "@/lib/automations/form-utils";
import { createDefaultExecutionFlow } from "@/lib/automations/execution-flow";

import { inferJobCategory } from "./categories";
import { formatLearnedSettingSummary } from "./labels";
import { loadUserWorkProfile } from "./store";
import type { JobCategoryId, JobLearnedSettings, UserWorkProfile } from "./types";

export type WorkProfileSuggestion = {
  jobCategory: JobCategoryId;
  label: string;
  summary: string;
  settings: JobLearnedSettings;
  source: "learned" | "manual";
};

function resolveSettings(
  profile: UserWorkProfile,
  category: JobCategoryId,
): JobLearnedSettings | null {
  const manual = profile.manualOverrides.find(
    (item) => item.jobCategory === category,
  );
  const learned = profile.jobSettings[category];

  if (manual) {
    return {
      usageCount: learned?.usageCount ?? 1,
      lastUsedAt: manual.updatedAt,
      executionLevel: manual.executionLevel ?? learned?.executionLevel,
      workflowTemplateId:
        manual.workflowTemplateId ?? learned?.workflowTemplateId,
      preferredFormat:
        manual.preferredFormat ??
        learned?.preferredFormat ??
        profile.preferredFormats[category],
      preferredHour:
        manual.preferredHour ??
        learned?.preferredHour ??
        profile.preferredPostingTimes[category]?.hour,
      preferredMinute:
        manual.preferredMinute ??
        learned?.preferredMinute ??
        profile.preferredPostingTimes[category]?.minute,
      frequency: manual.frequency ?? learned?.frequency,
    };
  }

  if (!learned) {
    const format = profile.preferredFormats[category];
    const time = profile.preferredPostingTimes[category];
    if (!format && !time) return null;
    return {
      usageCount: 0,
      lastUsedAt: profile.updatedAt,
      preferredFormat: format,
      preferredHour: time?.hour,
      preferredMinute: time?.minute,
    };
  }

  return {
    ...learned,
    preferredFormat:
      learned.preferredFormat ?? profile.preferredFormats[category],
    preferredHour:
      learned.preferredHour ?? profile.preferredPostingTimes[category]?.hour,
    preferredMinute:
      learned.preferredMinute ??
      profile.preferredPostingTimes[category]?.minute,
  };
}

export function getSuggestionForText(text: string): WorkProfileSuggestion | null {
  const profile = loadUserWorkProfile();
  const category = inferJobCategory(text);
  const settings = resolveSettings(profile, category);
  if (!settings) return null;

  const hasSignal =
    settings.executionLevel ||
    settings.preferredFormat ||
    settings.preferredHour !== undefined ||
    settings.frequency;

  if (!hasSignal) return null;

  const manual = profile.manualOverrides.find(
    (item) => item.jobCategory === category,
  );

  return {
    jobCategory: category,
    label: manual?.label ?? profile.frequentlyUsedJobs.find((j) => j.jobCategory === category)?.label ?? text.slice(0, 20),
    summary: manual?.summary ?? formatLearnedSettingSummary(settings),
    settings,
    source: manual ? "manual" : "learned",
  };
}

export function getAllSuggestions(
  profile: UserWorkProfile = loadUserWorkProfile(),
): WorkProfileSuggestion[] {
  const categories = new Set<JobCategoryId>([
    ...profile.frequentlyUsedJobs.map((item) => item.jobCategory),
    ...profile.manualOverrides.map((item) => item.jobCategory),
    ...(Object.keys(profile.jobSettings) as JobCategoryId[]),
  ]);

  const suggestions: WorkProfileSuggestion[] = [];

  for (const category of categories) {
    const settings = resolveSettings(profile, category);
    if (!settings) continue;

    const job = profile.frequentlyUsedJobs.find(
      (item) => item.jobCategory === category,
    );
    const manual = profile.manualOverrides.find(
      (item) => item.jobCategory === category,
    );

    suggestions.push({
      jobCategory: category,
      label: manual?.label ?? job?.label ?? category,
      summary: manual?.summary ?? formatLearnedSettingSummary(settings),
      settings,
      source: manual ? "manual" : "learned",
    });
  }

  return suggestions.sort(
    (a, b) => (b.settings.usageCount ?? 0) - (a.settings.usageCount ?? 0),
  );
}

/** Apply learned defaults to automation registration form (UI layer only). */
export function applyWorkProfileToFormState(
  state: AutomationFormState,
): AutomationFormState {
  const suggestion = getSuggestionForText(`${state.title} ${state.assignment}`);
  if (!suggestion) return state;

  const { settings } = suggestion;
  let next: AutomationFormState = { ...state };

  if (settings.executionLevel) {
    next.executionLevel = settings.executionLevel;
  }

  if (settings.preferredHour !== undefined) {
    next.hour = settings.preferredHour;
    next.minute = settings.preferredMinute ?? 0;
  }

  if (settings.frequency) {
    next.frequency = settings.frequency;
  }

  if (settings.workflowTemplateId) {
    next.executionFlow = createDefaultExecutionFlow(settings.workflowTemplateId);
  }

  return next;
}

export function hasLearnedPreferences(
  profile: UserWorkProfile = loadUserWorkProfile(),
): boolean {
  return (
    profile.frequentlyUsedJobs.length > 0 ||
    profile.manualOverrides.length > 0 ||
    Object.keys(profile.jobSettings).length > 0
  );
}
