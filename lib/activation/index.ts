export { ACTIVATION_FEATURE_EVALUATION } from "./feature-evaluation";
export {
  ACTIVATION_EVENT_NAMES,
  ACTIVATION_GOAL_IDS,
  FIRST_SUCCESS_KINDS,
  TRIAL_POLICY_MODES,
} from "./types";
export type {
  ActivationEventName,
  ActivationGoalId,
  ActivationPhase,
  ActivationProgress,
  ActivationEventPayload,
  FirstSuccessKind,
  TrialPolicy,
  OAuthFailureReason,
} from "./types";
export {
  ACTIVATION_GOALS,
  getActivationGoal,
  listAvailableGoals,
  getRecommendedGoalId,
  buildQuickStartHref,
} from "./goals";
export { resolveTrialPolicy } from "./trial-policy";
export { isQualifyingFirstSuccess, requestCompletedIsActivation } from "./first-success";
export { classifyOAuthFailure, oauthFailureCopy } from "./oauth-errors";
export { resolveActivationPaywall } from "./paywall-policy";
export { buildActivationChecklist, describeResume } from "./checklist";
export { activationEmptyCopy } from "./empty-copy";
export { buildActivationFunnel } from "./funnel";
export { toSafeEventPayload, stripForbiddenFields } from "./privacy";
