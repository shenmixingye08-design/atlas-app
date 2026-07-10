export {
  ONBOARDING_TASKS,
  ONBOARDING_TASK_IDS,
  getOnboardingTask,
  type OnboardingTaskDefinition,
} from "./tasks";

export {
  DEFAULT_ONBOARDING_STATE,
  normalizeOnboardingState,
  getOnboardingState,
  shouldShowWelcomeWizard,
  deferOnboarding,
  completeOnboarding,
  resetOnboardingForRedo,
} from "./store";

export { seedProfileFromOnboarding } from "./seed-profile";

export {
  getPreferredOnboardingTasks,
  sortFrequentWorkPresets,
  getRecommendedIntegrations,
  getRecommendedAutomations,
  applyOnboardingPriorityBoost,
  type RecommendedIntegration,
  type RecommendedAutomation,
} from "./recommendations";
