/**
 * Household preferences on the existing Personal Memory SoT.
 * Never creates a second memory backend. Inferences stay candidates.
 */

import {
  DEFAULT_HOUSEHOLD_COLUMNS,
  DEFAULT_HOUSEHOLD_PREFERENCES,
  HOUSEHOLD_CATEGORIES,
  type HouseholdBookDocument,
  type HouseholdCategory,
  type HouseholdColumn,
  type HouseholdPreferences,
} from "@/lib/household-book/types";
import { storeCategoryKey } from "@/lib/household-book/categories";
import type { CreatePersonalMemoryInput } from "@/lib/personal-memory/types";

export const HOUSEHOLD_MEMORY_KEYS = {
  storeCategoryPrefix: "household_store_category:",
  preferredCategories: "household_preferred_categories",
  columnOrder: "household_column_order",
  monthStartDay: "household_month_start_day",
  aggregation: "household_aggregation",
} as const;

export function preferencesFromMemoryValues(
  values: Array<{ scope: string; key: string; value: Record<string, unknown> }>,
): HouseholdPreferences {
  const next: HouseholdPreferences = {
    storeCategories: { ...DEFAULT_HOUSEHOLD_PREFERENCES.storeCategories },
    preferredCategories: [...DEFAULT_HOUSEHOLD_PREFERENCES.preferredCategories],
    columnOrder: [...DEFAULT_HOUSEHOLD_PREFERENCES.columnOrder],
    monthStartDay: DEFAULT_HOUSEHOLD_PREFERENCES.monthStartDay,
    aggregation: DEFAULT_HOUSEHOLD_PREFERENCES.aggregation,
  };

  for (const row of values) {
    if (row.key.startsWith(HOUSEHOLD_MEMORY_KEYS.storeCategoryPrefix)) {
      const category = row.value.category;
      if (
        typeof category === "string" &&
        (HOUSEHOLD_CATEGORIES as readonly string[]).includes(category)
      ) {
        const storeKey =
          typeof row.value.storeKey === "string"
            ? row.value.storeKey
            : row.key.slice(HOUSEHOLD_MEMORY_KEYS.storeCategoryPrefix.length);
        next.storeCategories[storeKey] = category as HouseholdCategory;
      }
    }
    if (row.key === HOUSEHOLD_MEMORY_KEYS.preferredCategories && Array.isArray(row.value.categories)) {
      next.preferredCategories = row.value.categories.filter(
        (item): item is HouseholdCategory =>
          typeof item === "string" &&
          (HOUSEHOLD_CATEGORIES as readonly string[]).includes(item),
      );
    }
    if (row.key === HOUSEHOLD_MEMORY_KEYS.columnOrder && Array.isArray(row.value.columns)) {
      const cols = row.value.columns.filter(
        (item): item is HouseholdColumn =>
          typeof item === "string" &&
          (DEFAULT_HOUSEHOLD_COLUMNS as readonly string[]).includes(item),
      );
      if (cols.length > 0) next.columnOrder = cols;
    }
    if (row.key === HOUSEHOLD_MEMORY_KEYS.monthStartDay && typeof row.value.day === "number") {
      if (row.value.day >= 1 && row.value.day <= 28) next.monthStartDay = row.value.day;
    }
    if (
      row.key === HOUSEHOLD_MEMORY_KEYS.aggregation &&
      (row.value.mode === "category" || row.value.mode === "store" || row.value.mode === "day")
    ) {
      next.aggregation = row.value.mode;
    }
  }

  return next;
}

export function buildHouseholdMemoryCandidateInputs(
  book: HouseholdBookDocument,
): CreatePersonalMemoryInput[] {
  const inputs: CreatePersonalMemoryInput[] = [];
  const seen = new Set<string>();
  for (const receipt of book.receipts) {
    if (!receipt.storeName) continue;
    const confident = receipt.items.find((line) => line.categoryConfident && line.category !== "その他");
    if (!confident || confident.category === "未分類") continue;
    const key = storeCategoryKey(receipt.storeName);
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push({
      kind: "work_preference",
      scope: "recurring_work_preferences",
      key: `${HOUSEHOLD_MEMORY_KEYS.storeCategoryPrefix}${key}`,
      value: {
        storeName: receipt.storeName,
        storeKey: key,
        category: confident.category,
      },
      title: `${receipt.storeName}の家計簿カテゴリ`,
      summary: `${receipt.storeName} → ${confident.category}`,
      source: "system_inference",
      status: "candidate",
      confidence: Math.min(0.8, receipt.confidence),
      appliesTo: { global: true, artifactTypes: ["xlsx"], capabilities: [] },
    });
  }
  return inputs.slice(0, 8);
}
