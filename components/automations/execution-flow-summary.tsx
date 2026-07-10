"use client";

import type { WorkExecutionFlow } from "@/lib/automations/types";
import {
  formatExecutionFlowSummary,
  normalizeExecutionFlow,
} from "@/lib/automations/execution-flow";
import { getStepDefinition } from "@/lib/automations/workflow-templates";
import { ui } from "@/lib/i18n";

type ExecutionFlowSummaryProps = {
  flow: WorkExecutionFlow;
  compact?: boolean;
};

export function ExecutionFlowSummary({
  flow,
  compact = false,
}: ExecutionFlowSummaryProps) {
  const normalized = normalizeExecutionFlow(flow);

  if (compact) {
    return (
      <p className="text-caption text-[var(--foreground-muted)]">
        {formatExecutionFlowSummary(normalized)}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-overline">{ui.executionFlow.cardLabel}</p>
      <ol className="flex flex-wrap gap-2">
        {normalized.steps.map((step) => {
          const label =
            getStepDefinition(normalized.templateId, step.id)?.label ?? step.id;

          return (
            <li
              key={step.id}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                step.enabled
                  ? "bg-accent/10 text-accent"
                  : "bg-[var(--background-subtle)] text-[var(--foreground-muted)] line-through"
              }`}
            >
              {step.enabled ? "✓" : "—"} {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
