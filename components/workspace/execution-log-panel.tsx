"use client";

import type { ActionRequest } from "@/lib/actions/types";
import { formatDuration } from "@/lib/execution";
import type { SimulatedExecution } from "@/lib/execution";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

import { useSandboxExecution } from "./use-sandbox-execution";

type ExecutionLogPanelProps = {
  actions: readonly ActionRequest[];
};

function ExecutionEntry({ execution }: { execution: SimulatedExecution }) {
  const isComplete = execution.phase === "completed";

  return (
    <li className="space-y-4 border-b border-[var(--border)] pb-8 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{execution.action}</p>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {execution.providerName} → {execution.targetService}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-foreground">{execution.statusLabel}</p>
          {execution.totalDurationMs > 0 && (
            <p className="mt-1 text-caption text-[var(--foreground-muted)]">
              {formatDuration(execution.totalDurationMs)}
            </p>
          )}
        </div>
      </div>

      <ol className="space-y-2">
        {execution.timeline.map((step) => (
          <li
            key={step.phase}
            className={`flex items-center justify-between gap-4 text-sm ${
              step.completed
                ? "text-foreground"
                : "text-[var(--foreground-subtle)]"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  step.completed
                    ? "bg-[var(--status-success)]"
                    : "bg-[var(--border)]"
                }`}
                aria-hidden="true"
              />
              {step.label}
            </span>
            {step.completed && step.durationMs > 0 && (
              <span className="text-caption">{formatDuration(step.durationMs)}</span>
            )}
          </li>
        ))}
      </ol>

      {isComplete && (
        <div className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-4 py-3 animate-fade-in">
          <p className="text-overline">{ui.execution.summaryLabel}</p>
          <p className="mt-1 text-sm text-foreground">{execution.summary}</p>
          {execution.detail && (
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              {execution.detail}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function ExecutionLogPanel({ actions }: ExecutionLogPanelProps) {
  const { executions, isRunning, isComplete } = useSandboxExecution(actions);

  if (actions.length === 0 || executions.length === 0) {
    return null;
  }

  return (
    <section
      className="space-y-4 animate-comm-in"
      aria-labelledby="execution-log-heading"
    >
      <div>
        <h2 id="execution-log-heading" className="text-title text-foreground">
          {ui.execution.sectionTitle}
        </h2>
        <p className="mt-1 text-caption">
          {isComplete
            ? ui.execution.completeNote
            : isRunning
              ? ui.execution.runningNote
              : ui.execution.sandboxNote}
        </p>
      </div>

      <Card padding="lg">
        <ul className="space-y-8">
          {executions.map((execution) => (
            <ExecutionEntry key={execution.actionId} execution={execution} />
          ))}
        </ul>
      </Card>
    </section>
  );
}
