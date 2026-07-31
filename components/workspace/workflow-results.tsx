"use client";

import { ui } from "@/lib/i18n";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { WorkflowPhaseState } from "@/lib/workspace/types";
import { ErrorState } from "@/components/ui/error-state";

type WorkflowResultsProps = {
  result: OrchestrationResult | null;
  loadingPhases: WorkflowPhaseState[];
  isLoading: boolean;
  error: string | null;
};

/**
 * Phase1 wait UI — secretary phrases only. No tool / model / pipeline jargon.
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
  const current = loadingPhases[runningIndex] ?? loadingPhases[0];
  const label = current?.label ?? ui.secretaryProgress.understand;

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-in py-16 text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {label}
      </h2>
      {error ? <ErrorState message={error} /> : null}
    </div>
  );
}
