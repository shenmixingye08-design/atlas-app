import type { AutomationExecutionLevel } from "@/lib/automations/types";
import type { CreateAutomationInput } from "@/lib/automations/types";
import type { SalesFormatPreset } from "@/lib/workspace/sales-material/types";

import { inferJobCategory, getJobCategoryLabel } from "./categories";
import { formatLearnedSettingSummary } from "./labels";
import { loadUserWorkProfile, saveUserWorkProfile } from "./store";
import { queueProfileMemorySync } from "@/lib/user-memory/client";
import type {
  DeliverableFormatPreference,
  JobCategoryId,
  JobLearnedSettings,
  JobUsageStat,
  ManualPreferenceEntry,
  UserWorkProfile,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function bumpUsage(
  jobs: JobUsageStat[],
  category: JobCategoryId,
  label: string,
): JobUsageStat[] {
  const existing = jobs.find((item) => item.jobCategory === category);
  if (existing) {
    return jobs
      .map((item) =>
        item.jobCategory === category
          ? {
              ...item,
              count: item.count + 1,
              label,
              lastUsedAt: nowIso(),
            }
          : item,
      )
      .sort((a, b) => b.count - a.count);
  }

  return [
    { jobCategory: category, label, count: 1, lastUsedAt: nowIso() },
    ...jobs,
  ].sort((a, b) => b.count - a.count);
}

function mergeJobSettings(
  current: JobLearnedSettings | undefined,
  patch: Partial<JobLearnedSettings>,
): JobLearnedSettings {
  return {
    usageCount: (current?.usageCount ?? 0) + 1,
    lastUsedAt: nowIso(),
    executionLevel: patch.executionLevel ?? current?.executionLevel,
    workflowTemplateId:
      patch.workflowTemplateId ?? current?.workflowTemplateId,
    enabledFlowStepIds:
      patch.enabledFlowStepIds ?? current?.enabledFlowStepIds,
    preferredFormat: patch.preferredFormat ?? current?.preferredFormat,
    preferredHour: patch.preferredHour ?? current?.preferredHour,
    preferredMinute: patch.preferredMinute ?? current?.preferredMinute,
    frequency: patch.frequency ?? current?.frequency,
  };
}

function syncManualOverride(
  profile: UserWorkProfile,
  category: JobCategoryId,
  settings: JobLearnedSettings,
): ManualPreferenceEntry[] {
  const label = getJobCategoryLabel(category);
  const summary = formatLearnedSettingSummary(settings);
  const existing = profile.manualOverrides.find(
    (item) => item.jobCategory === category && !item.integrationScope,
  );

  const entry: ManualPreferenceEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    jobCategory: category,
    label,
    summary,
    executionLevel: settings.executionLevel,
    workflowTemplateId: settings.workflowTemplateId,
    preferredFormat: settings.preferredFormat,
    preferredHour: settings.preferredHour,
    preferredMinute: settings.preferredMinute,
    frequency: settings.frequency,
    updatedAt: nowIso(),
  };

  if (existing) {
    return profile.manualOverrides.map((item) =>
      item.id === existing.id ? entry : item,
    );
  }

  return [entry, ...profile.manualOverrides];
}

function persist(profile: UserWorkProfile): UserWorkProfile {
  const next = { ...profile, updatedAt: nowIso() };
  saveUserWorkProfile(next);
  if (typeof window !== "undefined") {
    queueProfileMemorySync({
      frequentlyUsedJobs: next.frequentlyUsedJobs,
      jobSettings: next.jobSettings,
      manualOverrides: next.manualOverrides,
    });
  }
  return next;
}

export type RecordJobUsageInput = {
  text: string;
  label?: string;
  executionLevel?: AutomationExecutionLevel;
  preferredFormat?: DeliverableFormatPreference;
  preferredHour?: number;
  preferredMinute?: number;
  frequency?: "daily" | "weekly" | "monthly";
  workflowTemplateId?: JobLearnedSettings["workflowTemplateId"];
};

/** Record any job interaction — increments usage and merges settings. */
export function recordJobUsage(input: RecordJobUsageInput): UserWorkProfile {
  const profile = loadUserWorkProfile();
  const category = inferJobCategory(input.text);
  const label = input.label ?? getJobCategoryLabel(category);

  const settings = mergeJobSettings(profile.jobSettings[category], {
    executionLevel: input.executionLevel,
    preferredFormat: input.preferredFormat,
    preferredHour: input.preferredHour,
    preferredMinute: input.preferredMinute,
    frequency: input.frequency,
    workflowTemplateId: input.workflowTemplateId,
  });

  const preferredFormats = { ...profile.preferredFormats };
  if (input.preferredFormat) {
    preferredFormats[category] = input.preferredFormat;
  }

  const preferredPostingTimes = { ...profile.preferredPostingTimes };
  if (input.preferredHour !== undefined) {
    preferredPostingTimes[category] = {
      hour: input.preferredHour,
      minute: input.preferredMinute ?? 0,
    };
  }

  const next: UserWorkProfile = {
    ...profile,
    frequentlyUsedJobs: bumpUsage(profile.frequentlyUsedJobs, category, label),
    preferredFormats,
    preferredPostingTimes,
    jobSettings: { ...profile.jobSettings, [category]: settings },
    manualOverrides: syncManualOverride(profile, category, settings),
  };

  return persist(next);
}

/** Learn from a newly registered habit (client-side, after API success). */
export function recordAutomationCreated(
  input: CreateAutomationInput,
): UserWorkProfile {
  const schedule = input.schedule;
  let hour: number | undefined;
  let minute: number | undefined;
  let frequency: "daily" | "weekly" | "monthly" | undefined;

  if (schedule.kind === "schedule") {
    hour = schedule.preset.hour;
    minute = schedule.preset.minute;
    frequency = schedule.preset.type;
  }

  return recordJobUsage({
    text: `${input.name} ${input.workflow.assignment}`,
    label: input.name,
    executionLevel: input.executionLevel,
    preferredHour: hour,
    preferredMinute: minute,
    frequency,
    workflowTemplateId: input.executionFlow?.templateId,
  });
}

/** Learn deliverable format choice (sales material wizard, etc.). */
export function recordDeliverableFormatChoice(
  text: string,
  format: SalesFormatPreset | DeliverableFormatPreference,
): UserWorkProfile {
  if (format === "all") {
    return recordJobUsage({ text, preferredFormat: "pptx_pdf" });
  }
  return recordJobUsage({ text, preferredFormat: format });
}

export function saveManualOverride(
  entry: Omit<ManualPreferenceEntry, "id" | "updatedAt"> & { id?: string },
): UserWorkProfile {
  const profile = loadUserWorkProfile();
  const id = entry.id ?? crypto.randomUUID();
  const nextEntry: ManualPreferenceEntry = {
    ...entry,
    id,
    updatedAt: nowIso(),
  };

  const manualOverrides = [
    nextEntry,
    ...profile.manualOverrides.filter((item) => item.id !== id),
  ];

  const jobSettings = {
    ...profile.jobSettings,
    [entry.jobCategory]: mergeJobSettings(profile.jobSettings[entry.jobCategory], {
      executionLevel: entry.executionLevel,
      workflowTemplateId: entry.workflowTemplateId,
      preferredFormat: entry.preferredFormat,
      preferredHour: entry.preferredHour,
      preferredMinute: entry.preferredMinute,
      frequency: entry.frequency,
    }),
  };

  if (entry.preferredFormat) {
    profile.preferredFormats[entry.jobCategory] = entry.preferredFormat;
  }

  return persist({
    ...profile,
    manualOverrides,
    jobSettings,
    preferredFormats: profile.preferredFormats,
  });
}

export function deleteManualOverride(id: string): UserWorkProfile {
  const profile = loadUserWorkProfile();
  return persist({
    ...profile,
    manualOverrides: profile.manualOverrides.filter((item) => item.id !== id),
  });
}

export function getTopFrequentJobs(
  profile: UserWorkProfile,
  limit = 5,
): JobUsageStat[] {
  return profile.frequentlyUsedJobs.slice(0, limit);
}

export function getApprovalRequiredJobs(
  profile: UserWorkProfile,
): JobCategoryId[] {
  return Object.entries(profile.jobSettings)
    .filter(
      ([, settings]) =>
        settings?.executionLevel === "approve_then_run" ||
        settings?.executionLevel === "suggest_only" ||
        settings?.executionLevel === "draft_save",
    )
    .map(([category]) => category as JobCategoryId);
}

export function getFullAutoJobs(profile: UserWorkProfile): JobCategoryId[] {
  return Object.entries(profile.jobSettings)
    .filter(([, settings]) => settings?.executionLevel === "full_auto")
    .map(([category]) => category as JobCategoryId);
}
