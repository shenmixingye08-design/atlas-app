import type { Automation } from "@/lib/automations/types";

import {
  DEFAULT_CATEGORY_EXECUTION_MODES,
  jobCategoryFromAutomation,
} from "./job-categories";
import type { AutomationExecutionMode } from "./execution-mode";
import { normalizeExecutionMode } from "./execution-mode";

export function resolveAutomationExecutionMode(
  automation: Automation,
  categoryDefaults?: Partial<
    Record<
      ReturnType<typeof jobCategoryFromAutomation>,
      AutomationExecutionMode
    >
  >,
): AutomationExecutionMode {
  if (automation.executionMode) {
    return normalizeExecutionMode(automation.executionMode);
  }

  const category = jobCategoryFromAutomation(automation);
  const fallback =
    categoryDefaults?.[category] ?? DEFAULT_CATEGORY_EXECUTION_MODES[category];
  return normalizeExecutionMode(fallback);
}
