import type { AutomationExecutionLevel } from "@/lib/automations/types";
import type { WorkflowTemplateId } from "@/lib/automations/types";

/** Job kinds ATLAS learns — extend for new work types and integrations. */
export type JobCategoryId =
  | "sales_material"
  | "blog"
  | "sns_post"
  | "video"
  | "email"
  | "file_organize"
  | "generic";

/** Deliverable format preference — shared with sales-material and future connectors. */
export type DeliverableFormatPreference =
  | "pptx"
  | "pdf"
  | "docx"
  | "xlsx"
  | "md"
  | "txt"
  | "pptx_pdf"
  | "docx_pdf";

/** Future: connector-scoped preferences (Google Drive, WordPress, SNS, etc.). */
export type IntegrationScope =
  | "atlas"
  | "google_drive"
  | "dropbox"
  | "wordpress"
  | "sns"
  | "youtube"
  | "email";

export type JobUsageStat = {
  jobCategory: JobCategoryId;
  label: string;
  count: number;
  lastUsedAt: string;
};

/** Learned defaults per job category from repeated usage. */
export type JobLearnedSettings = {
  executionLevel?: AutomationExecutionLevel;
  workflowTemplateId?: WorkflowTemplateId;
  enabledFlowStepIds?: string[];
  preferredFormat?: DeliverableFormatPreference;
  preferredHour?: number;
  preferredMinute?: number;
  frequency?: "daily" | "weekly" | "monthly";
  usageCount: number;
  lastUsedAt: string;
};

/** User-edited override shown in settings (edit / delete). */
export type ManualPreferenceEntry = {
  id: string;
  jobCategory: JobCategoryId;
  label: string;
  summary: string;
  executionLevel?: AutomationExecutionLevel;
  workflowTemplateId?: WorkflowTemplateId;
  preferredFormat?: DeliverableFormatPreference;
  preferredHour?: number;
  preferredMinute?: number;
  frequency?: "daily" | "weekly" | "monthly";
  integrationScope?: IntegrationScope;
  updatedAt: string;
};

/** First-time onboarding task selections — drives home priority and suggestions. */
export type OnboardingTaskId =
  | "sns"
  | "blog"
  | "sales_material"
  | "email"
  | "schedule"
  | "files"
  | "ai_chat"
  | "company"
  | "undecided";

export type OnboardingEntryMode = "guide" | "skip" | "later";

/** Welcome wizard state stored on the user work profile. */
export type UserOnboardingState = {
  showOnboarding: boolean;
  completedOnboarding: boolean;
  preferredTasks: OnboardingTaskId[];
  createdAt: string | null;
  entryMode?: OnboardingEntryMode;
  deferredAt?: string | null;
  /** First success experience — completed after onboarding. */
  firstExperienceCompleted?: boolean;
  firstExperienceDate?: string | null;
  firstTaskCategory?: JobCategoryId | null;
  firstTaskDuration?: number | null;
  firstExperienceDeferred?: boolean;
  firstExperienceTaskId?: string | null;
};

/** Persistent user work profile — localStorage today, userId-scoped later. */
export type UserWorkProfile = {
  version: 1;
  frequentlyUsedJobs: JobUsageStat[];
  preferredFormats: Partial<Record<JobCategoryId, DeliverableFormatPreference>>;
  preferredPostingTimes: Partial<
    Record<JobCategoryId, { hour: number; minute: number }>
  >;
  jobSettings: Partial<Record<JobCategoryId, JobLearnedSettings>>;
  manualOverrides: ManualPreferenceEntry[];
  onboarding?: UserOnboardingState;
  updatedAt: string;
};

export const USER_WORK_PROFILE_VERSION = 1 as const;

export const DEFAULT_USER_WORK_PROFILE: UserWorkProfile = {
  version: USER_WORK_PROFILE_VERSION,
  frequentlyUsedJobs: [],
  preferredFormats: {},
  preferredPostingTimes: {},
  jobSettings: {},
  manualOverrides: [],
  updatedAt: new Date(0).toISOString(),
};
