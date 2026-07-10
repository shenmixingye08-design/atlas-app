"use client";

import type { SnsBatchDays } from "@/lib/cost-optimization";
import { SNS_BATCH_OPTIONS } from "@/lib/cost-optimization";
import { ui } from "@/lib/i18n";

type SnsBatchSelectorProps = {
  value: SnsBatchDays | null;
  onChange: (days: SnsBatchDays | null) => void;
  disabled?: boolean;
};

export function SnsBatchSelector({
  value,
  onChange,
  disabled = false,
}: SnsBatchSelectorProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-foreground">
        {ui.costOptimization.snsBatchLabel}
      </legend>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.costOptimization.snsBatchHint}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors ${
            value === null
              ? "bg-accent text-white ring-accent"
              : "bg-white text-foreground ring-[var(--border-subtle)] hover:ring-accent/30"
          }`}
        >
          {ui.costOptimization.snsBatchDaily}
        </button>
        {SNS_BATCH_OPTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            onClick={() => onChange(option.days)}
            className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors ${
              value === option.days
                ? "bg-accent text-white ring-accent"
                : "bg-white text-foreground ring-[var(--border-subtle)] hover:ring-accent/30"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
