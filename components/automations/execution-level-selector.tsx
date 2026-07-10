"use client";

import type { AutomationExecutionLevel } from "@/lib/automations/types";
import {
  EXECUTION_LEVEL_OPTIONS,
  getExecutionLevelOption,
} from "@/lib/automations/execution-level";
import { ui } from "@/lib/i18n";

type ExecutionLevelSelectorProps = {
  value: AutomationExecutionLevel;
  onChange: (level: AutomationExecutionLevel) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function ExecutionLevelSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
}: ExecutionLevelSelectorProps) {
  const selected = getExecutionLevelOption(value);

  if (compact) {
    return (
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AutomationExecutionLevel)}
        className="h-9 max-w-[12rem] rounded-[var(--radius-lg)] bg-white px-3 text-sm text-foreground ring-1 ring-[var(--border-subtle)] focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
        aria-label={ui.requestScope.fieldLabel}
      >
        {EXECUTION_LEVEL_OPTIONS.map((option) => (
          <option key={option.level} value={option.level}>
            {option.shortLabel}
          </option>
        ))}
      </select>
    );
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-foreground">
        {ui.requestScope.fieldLabel}
      </legend>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.requestScope.fieldHint}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {EXECUTION_LEVEL_OPTIONS.map((option) => {
          const isSelected = value === option.level;

          return (
            <label
              key={option.level}
              className={`relative flex cursor-pointer gap-3 rounded-[var(--radius-xl)] border-2 px-4 py-4 transition-all ${
                isSelected
                  ? "border-accent bg-accent/5 shadow-[var(--shadow-sm)]"
                  : "border-[var(--border-subtle)] bg-white hover:border-accent/30"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="request-scope"
                value={option.level}
                checked={isSelected}
                onChange={() => onChange(option.level)}
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
              {isSelected && (
                <span
                  className="absolute right-3 top-3 h-2 w-2 rounded-full bg-accent"
                  aria-hidden
                />
              )}
            </label>
          );
        })}
      </div>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.requestScope.selectedPreview(selected.label)}
      </p>
    </fieldset>
  );
}

export function ExecutionLevelBadge({
  level,
}: {
  level: AutomationExecutionLevel;
}) {
  const option = getExecutionLevelOption(level);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
      title={option.description}
    >
      <span aria-hidden>{option.icon}</span>
      {option.shortLabel.replace(/^[^\s]+\s/, "")}
    </span>
  );
}
