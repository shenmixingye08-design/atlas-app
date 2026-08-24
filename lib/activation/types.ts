export const ACTIVATION_EVENT_NAMES = [
  "sign_up_completed",
  "onboarding_started",
  "goal_selected",
  "quick_start_selected",
  "first_request_submitted",
  "first_request_completed",
  "first_result_viewed",
  "first_artifact_downloaded",
  "integration_started",
  "integration_connected",
  "integration_failed",
  "first_automation_created",
  "first_automation_run_completed",
  "first_x_draft_created",
  "first_x_post_scheduled",
  "first_x_post_published",
  "paywall_viewed",
  "checkout_started",
  "subscription_activated",
  "onboarding_skipped",
  "onboarding_completed",
] as const;

export type ActivationEventName = (typeof ACTIVATION_EVENT_NAMES)[number];

export const ACTIVATION_GOAL_IDS = [
  "x_draft",
  "x_autopost",
  "document",
  "office_file",
  "calendar",
  "recurring",
  "try_request",
] as const;

export type ActivationGoalId = (typeof ACTIVATION_GOAL_IDS)[number];

export const ACTIVATION_PHASES = [
  "new_signup",
  "not_started",
  "in_progress",
  "completed",
  "skipped",
] as const;

export type ActivationPhase = (typeof ACTIVATION_PHASES)[number];

export const FIRST_SUCCESS_KINDS = [
  "request_completed_viewed",
  "artifact_opened",
  "x_draft_reviewed",
  "x_post_scheduled",
  "x_post_published",
  "automation_run_succeeded",
  "calendar_live_succeeded",
] as const;

export type FirstSuccessKind = (typeof FIRST_SUCCESS_KINDS)[number];

export const TRIAL_POLICY_MODES = [
  "single_success",
  "fixed_days",
  "disabled",
] as const;

export type TrialPolicyMode = (typeof TRIAL_POLICY_MODES)[number];

export type DeviceCategory = "mobile" | "tablet" | "desktop" | "unknown";

export type ActivationEventPayload = {
  event: ActivationEventName;
  userId: string;
  occurredAt: string;
  sourcePage: string | null;
  selectedGoal: ActivationGoalId | null;
  jobType: string | null;
  success: boolean | null;
  diagnosticId: string | null;
  plan: string | null;
  deviceCategory: DeviceCategory;
  appVersion: string | null;
  idempotencyKey: string;
};

export type ActivationDraftInputs = {
  theme?: string;
  audience?: string;
  tone?: string;
  count?: string;
  frequency?: string;
  hour?: string;
  approval?: "approval" | "auto";
  assignment?: string;
};

export type ActivationMilestones = Partial<
  Record<ActivationEventName, string>
> & {
  firstSuccessAt?: string;
  firstSuccessKind?: FirstSuccessKind;
};

export type ActivationProgress = {
  version: 1;
  userId: string;
  phase: ActivationPhase;
  selectedGoal: ActivationGoalId | null;
  recommendedGoal: ActivationGoalId;
  draftInputs: ActivationDraftInputs;
  currentStep: string | null;
  milestones: ActivationMilestones;
  checklistHidden: boolean;
  paywallShownAfterSuccess: boolean;
  legacyUser: boolean;
  registeredAt: string;
  updatedAt: string;
};

export type ActivationChecklistItemId =
  | "pick_goal"
  | "first_request"
  | "view_result"
  | "connect_integration"
  | "create_automation";

export type ActivationChecklistItem = {
  id: ActivationChecklistItemId;
  label: string;
  done: boolean;
  current: boolean;
  href: string;
  cta: string;
};

export type TrialPolicy = {
  mode: TrialPolicyMode;
  configuredMode: TrialPolicyMode;
  appliedInProduction: boolean;
  fixedDays: number;
};

export type ActivationPaywallReason =
  | "paid_feature"
  | "free_limit"
  | "after_first_success"
  | "create_count_limit"
  | "automation_limit";

export type OAuthFailureReason =
  | "user_cancelled"
  | "insufficient_scope"
  | "token_persist_failed"
  | "callback_failed"
  | "provider_error"
  | "misconfigured";
