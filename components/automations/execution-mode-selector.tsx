"use client";

import type { AutomationExecutionMode } from "@/lib/cost-optimization";
import {
  EXECUTION_MODE_OPTIONS,
  getExecutionModeOption,
} from "@/lib/cost-optimization";
import { useFeatureAvailability } from "@/lib/feature-flags";
import { ui } from "@/lib/i18n";

type ExecutionModeSelectorProps = {
  value: AutomationExecutionMode;
  onChange: (mode: AutomationExecutionMode) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function ExecutionModeSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
}: ExecutionModeSelectorProps) {
  const { isAvailable } = useFeatureAvailability();
  const options = EXECUTION_MODE_OPTIONS.filter(
    (option) =>
      option.mode !== "high_quality" || isAvailable("high_quality_mode"),
  );
  const selected = getExecutionModeOption(value);

  if (compact) {
    return (
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AutomationExecutionMode)}
        className="h-9 max-w-[12rem] rounded-[var(--radius-lg)] bg-white px-3 text-sm text-foreground ring-1 ring-[var(--border-subtle)] focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
        aria-label={ui.costOptimization.fieldLabel}
      >
        {options.map((option) => (
          <option key={option.mode} value={option.mode}>
            {option.shortLabel}
          </option>
        ))}
      </select>
    );
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-foreground">
        {ui.costOptimization.fieldLabel}
      </legend>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.costOptimization.fieldHint}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const isSelected = value === option.mode;

          return (
            <label
              key={option.mode}
              className={`relative flex cursor-pointer gap-3 rounded-[var(--radius-xl)] border-2 px-4 py-4 transition-all ${
                isSelected
                  ? "border-accent bg-accent/5 shadow-[var(--shadow-sm)]"
                  : "border-[var(--border-subtle)] bg-white hover:border-accent/30"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="execution-mode"
                value={option.mode}
                checked={isSelected}
                onChange={() => onChange(option.mode)}
                className="peer sr-only"
              />
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-xl"
                aria-hidden
              >
                {option.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-foreground">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--foreground-muted)]">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.costOptimization.selectedPreview(selected.label)}
      </p>
    </fieldset>
  );
}

export function ExecutionModeBadge({
  mode,
}: {
  mode: AutomationExecutionMode;
}) {
  const option = getExecutionModeOption(mode);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
      title={option.description}
    >
      <span aria-hidden>{option.icon}</span>
      {option.shortLabel.replace(/^[^\s]+\s/, "")}
    </span>
  );
}
