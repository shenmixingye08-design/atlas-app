import type { OnboardingTaskId } from "@/lib/user-profile/types";

/** External services collectable in the first-win wizard (preference only). */
export type RetentionIntegrationId =
  | "google"
  | "dropbox"
  | "x"
  | "email"
  | "calendar";

export type RetentionRoleId =
  | "sales"
  | "sns"
  | "office"
  | "executive"
  | "freelance"
  | "other";

export type RetentionDayId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RetentionDayStatus = "locked" | "current" | "done" | "missed";

export type RetentionSurveyAnswers = {
  helpful: "yes" | "somewhat" | "no";
  revision: "none" | "light" | "heavy";
  reuse: "yes" | "maybe" | "no";
  submittedAt: string;
};

export type RetentionWizardProfile = {
  workDescription: string;
  company: string;
  roleId: RetentionRoleId;
  preferredTasks: OnboardingTaskId[];
  integrations: RetentionIntegrationId[];
  completedAt: string | null;
};

export type RetentionDayProgress = {
  day: RetentionDayId;
  completedAt: string | null;
  skippedAt: string | null;
};

export type RetentionValueStats = {
  deliverableCount: number;
  automationSuccessCount: number;
  estimatedMinutesSaved: number;
  estimatedHoursSaved: number;
  memoryCompletionPercent: number;
  secretaryLevel: number;
  secretaryLevelLabel: string;
};

export type RetentionCohortFlags = {
  retainedDay7: boolean | null;
  retainedDay14: boolean | null;
  retainedDay30: boolean | null;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  activeDayKeys: string[];
};

export type RetentionState = {
  version: 1;
  wizard: RetentionWizardProfile;
  dayPlan: RetentionDayProgress[];
  survey: RetentionSurveyAnswers | null;
  surveyDismissedAt: string | null;
  /** ISO dates (YYYY-MM-DD) with at least one deliverable success. */
  successDayKeys: string[];
  cohort: RetentionCohortFlags;
  notificationsSent: Partial<
    Record<"deliverable" | "suggestion" | "memory" | "automation", string>
  >;
  updatedAt: string;
};

export type QuickWinDefinition = {
  id: string;
  title: string;
  description: string;
  href: string;
  deliverableLabel: string;
  roleIds: RetentionRoleId[];
  taskIds: OnboardingTaskId[];
};

export type NextAutomateSuggestion = {
  id: string;
  title: string;
  reason: string;
  href: string;
  priority: number;
};

export type HomeBootstrapItem = {
  id: string;
  kind: "recommended_work" | "quick_deliverable" | "popular_automation";
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
};
