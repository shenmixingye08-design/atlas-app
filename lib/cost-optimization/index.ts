export {
  DEFAULT_EXECUTION_MODE,
  EXECUTION_MODE_OPTIONS,
  executionModeToCostSavingMode,
  getExecutionModeOption,
  getExecutionModeShortLabel,
  normalizeExecutionMode,
  shouldPreferCache,
  shouldSkipRepeatedAiCalls,
} from "./execution-mode";
export type { AutomationExecutionMode, ExecutionModeOption } from "./execution-mode";

export {
  DEFAULT_CATEGORY_EXECUTION_MODES,
  JOB_CATEGORY_IDS,
  jobCategoryFromAutomation,
  jobCategoryFromTemplate,
} from "./job-categories";
export type { JobCategoryId } from "./job-categories";

export {
  SNS_BATCH_OPTIONS,
  buildSnsBatchAssignment,
  normalizeSnsBatchDays,
} from "./sns-batch";
export type { ScheduledPostDraft, SnsBatchDays } from "./sns-batch";

export {
  buildCostOptimizationMetadata,
  readCostOptimizationMetadata,
  readEffectiveCostSavingMode,
  readExecutionMode,
} from "./metadata";
export type { CostOptimizationMetadata, CostSavingMode } from "./metadata";

export { resolveAutomationExecutionMode } from "./resolve-mode";

export {
  defaultCategoryExecutionModes,
  loadCategoryExecutionModes,
  saveCategoryExecutionModes,
} from "./category-defaults-store";
export type { CategoryExecutionModeDefaults } from "./category-defaults-store";
