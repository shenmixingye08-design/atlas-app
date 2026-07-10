const STORAGE_KEY = "atlas-category-execution-modes";

import type { AutomationExecutionMode } from "./execution-mode";
import {
  DEFAULT_CATEGORY_EXECUTION_MODES,
  JOB_CATEGORY_IDS,
  type JobCategoryId,
} from "./job-categories";
import { normalizeExecutionMode } from "./execution-mode";

export type CategoryExecutionModeDefaults = Record<
  JobCategoryId,
  AutomationExecutionMode
>;

export function defaultCategoryExecutionModes(): CategoryExecutionModeDefaults {
  return { ...DEFAULT_CATEGORY_EXECUTION_MODES };
}

export function loadCategoryExecutionModes(): CategoryExecutionModeDefaults {
  if (typeof window === "undefined") {
    return defaultCategoryExecutionModes();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCategoryExecutionModes();
    const parsed = JSON.parse(raw) as Partial<CategoryExecutionModeDefaults>;
    const defaults = defaultCategoryExecutionModes();
    for (const id of JOB_CATEGORY_IDS) {
      if (parsed[id]) {
        defaults[id] = normalizeExecutionMode(parsed[id]);
      }
    }
    return defaults;
  } catch {
    return defaultCategoryExecutionModes();
  }
}

export function saveCategoryExecutionModes(
  modes: CategoryExecutionModeDefaults,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modes));
}
