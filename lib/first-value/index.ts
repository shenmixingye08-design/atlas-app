export { FIRST_VALUE_FEATURE_EVALUATION } from "./feature-evaluation";
export {
  QUICK_START_PRESETS,
  FREQUENCY_OPTIONS,
  getQuickStartPreset,
  buildQuickStartCreateHref,
  buildQuickStartTryNowHref,
  type QuickStartPreset,
  type QuickStartFrequency,
} from "./quick-start-presets";
export {
  buildSecretaryRoi,
  estimateSavedMinutesFromCompletions,
  type SecretaryRoiSummary,
  type RoiBasis,
} from "./roi";
export { computeSecretaryLevel, type SecretaryLevel } from "./secretary-level";
export {
  buildWorkCompletionItems,
  type WorkCompletionItem,
  type WorkCompletionStep,
} from "./work-completion";
export {
  trackFirstValueEvent,
  resetFirstValueAnalyticsForTests,
  listFirstValueEventsForTests,
  type FirstValueEventName,
} from "./analytics";
export {
  isSecretaryWorkNotification,
  filterSecretaryNotifications,
} from "./notification-policy";
export {
  evaluateRetention,
  markRetentionEmitted,
  ensureFirstSeenAt,
  resetRetentionForTests,
  type RetentionSnapshot,
} from "./retention";
