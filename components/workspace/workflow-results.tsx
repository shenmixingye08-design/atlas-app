"use client";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { WorkflowPhaseState } from "@/lib/workspace/types";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type WorkflowResultsProps = {
  result: OrchestrationResult | null;
  loadingPhases: WorkflowPhaseState[];
  isLoading: boolean;
  error: string | null;
};

/**
 * Waiting UI for first-time users — human progress only.
 * No CEO / Planner / QA / employees / debug / internal chat.
 */
export function WorkflowResults({
  loadingPhases,
  isLoading,
  error,
}: WorkflowResultsProps) {
  if (!isLoading) {
    return error ? <ErrorState message={error} /> : null;
  }

  const runningIndex = Math.max(
    0,
    loadingPhases.findIndex((p) => p.status === "running"),
  );
  const total = Math.max(loadingPhases.length, 1);
  const filled = Math.min(runningIndex + 1, total);
  const current = loadingPhases[runningIndex] ?? loadingPhases[0];

  return (
    <div className="mx-auto max-w-lg space-y-8 animate-fade-in py-10">
      <Card padding="lg" className="space-y-8 text-center shadow-none">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {current?.label ?? ui.secretaryProgress.write}
          </h2>
        </div>

        <div
          className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--surface-muted)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={filled}
          aria-label={current?.label ?? "進捗"}
        >
          <div
            className="h-full rounded-full bg-foreground/80 transition-all duration-500"
            style={{ width: `${Math.round((filled / total) * 100)}%` }}
          />
        </div>

        <ol className="space-y-2 text-left text-sm text-[var(--foreground-muted)]">
          {loadingPhases.map((phase, index) => (
            <li
              key={phase.id}
              className={cn(
                "flex items-center gap-3 px-1 py-1",
                index < runningIndex && "text-foreground",
                index === runningIndex && "font-medium text-foreground",
              )}
            >
              <span aria-hidden className="w-5 text-center">
                {index < runningIndex ? "✓" : index === runningIndex ? "●" : "○"}
              </span>
              <span>{phase.label}</span>
            </li>
          ))}
        </ol>
      </Card>

      {error && <ErrorState message={error} />}
    </div>
  );
}
