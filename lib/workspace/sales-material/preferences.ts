"use client";

import {
  DEFAULT_SALES_MATERIAL_PREFERENCES,
  type SalesFormatPreset,
  type SalesMaterialUserPreferences,
  type SalesCostMode,
} from "./types";

const STORAGE_KEY = "atlas-sales-material-preferences";

function isSalesFormatPreset(value: unknown): value is SalesFormatPreset {
  return (
    value === "pptx" ||
    value === "pdf" ||
    value === "docx" ||
    value === "xlsx" ||
    value === "md" ||
    value === "txt" ||
    value === "pptx_pdf" ||
    value === "docx_pdf" ||
    value === "all"
  );
}

function isCostMode(value: unknown): value is SalesCostMode {
  return value === "low" || value === "standard" || value === "high";
}

export function loadSalesMaterialPreferences(): SalesMaterialUserPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_SALES_MATERIAL_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SALES_MATERIAL_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<SalesMaterialUserPreferences>;
    return {
      ...DEFAULT_SALES_MATERIAL_PREFERENCES,
      ...parsed,
      preferred_output_formats: isSalesFormatPreset(parsed.preferred_output_formats)
        ? parsed.preferred_output_formats
        : DEFAULT_SALES_MATERIAL_PREFERENCES.preferred_output_formats,
      last_selected_output_format: isSalesFormatPreset(parsed.last_selected_output_format)
        ? parsed.last_selected_output_format
        : DEFAULT_SALES_MATERIAL_PREFERENCES.last_selected_output_format,
      cost_saving_mode: isCostMode(parsed.cost_saving_mode)
        ? parsed.cost_saving_mode
        : DEFAULT_SALES_MATERIAL_PREFERENCES.cost_saving_mode,
    };
  } catch {
    return DEFAULT_SALES_MATERIAL_PREFERENCES;
  }
}

export function saveSalesMaterialPreferences(
  prefs: SalesMaterialUserPreferences,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function updateSalesMaterialPreferences(
  patch: Partial<SalesMaterialUserPreferences>,
): SalesMaterialUserPreferences {
  const next = { ...loadSalesMaterialPreferences(), ...patch };
  saveSalesMaterialPreferences(next);
  return next;
}

export function hasUsedSalesMaterialBefore(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}
