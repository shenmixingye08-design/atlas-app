"use client";

import { useState } from "react";

import { ui } from "@/lib/i18n";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { ErrorState } from "@/components/ui/error-state";

import { WorkflowResultsDetail } from "./workflow-results-detail";

type WorkflowResultsProps = {
  result: OrchestrationResult | null;
  isLoading: boolean;
  error: string | null;
};

/**
 * Post-run optional details. Primary progress UX is UserFacingProgress —
 * this panel does not surface Planner / Reviewer / AI employee names.
 */
export function WorkflowResults({
  result,
  isLoading,
  error,
}: WorkflowResultsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!result || isLoading) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {error && <ErrorState message={error} />}

      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-accent hover:underline focus-ring rounded"
        >
          {expanded ? ui.work.hideDetails : ui.work.viewDetails}
        </button>
        {expanded && (
          <div className="mt-8 animate-fade-up">
            <WorkflowResultsDetail result={result} error={error} />
          </div>
        )}
      </div>
    </div>
  );
}
