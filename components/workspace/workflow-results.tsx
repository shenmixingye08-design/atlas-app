"use client";

import { useMemo, useState } from "react";

import { mapWorkflowPhasesToAiEmployees } from "@/lib/ai-employees";
import { mapExecutionsToAiEmployees } from "@/lib/team-collaboration";
import { buildTeamCollaborationSnapshot } from "@/lib/team-collaboration";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hasMeaningfulContent } from "@/lib/orchestration/final-deliverable";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import {
  buildInternalMessagesFromPhases,
  buildInternalMessagesFromResult,
} from "@/lib/workspace/internal-messages";
import type { WorkflowPhaseState } from "@/lib/workspace/types";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

import { AiEmployeesPanel } from "./ai-employees-panel";
import { InternalCommunicationTimeline } from "./internal-communication-timeline";
import { TeamCollaborationPanel } from "./team-collaboration-panel";
import { WorkflowResultsDetail } from "./workflow-results-detail";

type PeacefulStage = {
  id: string;
  label: string;
  activeLabel: string;
  status: "done" | "current" | "upcoming";
};

const STAGE_ORDER = [
  { id: "research", label: ui.workflow.research, activeLabel: ui.workflow.researchActive },
  { id: "planning", label: ui.workflow.planning, activeLabel: ui.workflow.planningActive },
  { id: "working", label: ui.workflow.working, activeLabel: ui.workflow.workingActive },
  { id: "review", label: ui.workflow.review, activeLabel: ui.workflow.reviewActive },
  { id: "completed", label: ui.workflow.completed, activeLabel: ui.workflow.completed },
];

function mapPhaseToStageIndex(phaseId: string): number {
  if (phaseId.includes("research")) return 0;
  if (phaseId.includes("planner")) return 1;
  if (phaseId.includes("worker")) return 2;
  if (phaseId.includes("reviewer") || phaseId.includes("quality")) return 3;
  return 4;
}

function buildPeacefulStages(
  phases: WorkflowPhaseState[],
  isComplete: boolean,
): PeacefulStage[] {
  if (isComplete) {
    return STAGE_ORDER.map((s) => ({ ...s, status: "done" as const }));
  }

  const runningIndex = phases.findIndex((p) => p.status === "running");
  const activeIndex =
    runningIndex >= 0
      ? mapPhaseToStageIndex(phases[runningIndex]!.id)
      : phases.findIndex((p) => p.status === "waiting");

  return STAGE_ORDER.map((stage, index) => {
    if (index < activeIndex) return { ...stage, status: "done" as const };
    if (index === activeIndex) return { ...stage, status: "current" as const };
    return { ...stage, status: "upcoming" as const };
  });
}

type WorkflowResultsProps = {
  result: OrchestrationResult | null;
  loadingPhases: WorkflowPhaseState[];
  isLoading: boolean;
  error: string | null;
};

export function WorkflowResults({
  result,
  loadingPhases,
  isLoading,
  error,
}: WorkflowResultsProps) {
  const [expanded, setExpanded] = useState(false);

  const internalMessages = useMemo(() => {
    if (result) {
      return buildInternalMessagesFromResult(result);
    }
    return buildInternalMessagesFromPhases(loadingPhases);
  }, [result, loadingPhases]);

  const isWorkComplete =
    !isLoading &&
    result !== null &&
    result.status !== "failed" &&
    hasMeaningfulContent(getDeliverablePreviewText(result.deliverable)) &&
    result.approved;

  const aiEmployees = useMemo(() => {
    if (result) {
      return mapExecutionsToAiEmployees(result, { isComplete: isWorkComplete });
    }
    return mapWorkflowPhasesToAiEmployees(loadingPhases, {
      isComplete: isWorkComplete,
    });
  }, [result, loadingPhases, isWorkComplete]);

  const teamSnapshot = useMemo(
    () => (result ? buildTeamCollaborationSnapshot(result) : null),
    [result],
  );

  if (!result && !isLoading) {
    return null;
  }

  const stages = buildPeacefulStages(loadingPhases, isWorkComplete);
  const current = stages.find((s) => s.status === "current");

  const headline =
    isLoading && !result
      ? (current?.activeLabel ?? ui.workflow.workingActive)
      : result?.status === "failed"
        ? ui.workflow.reviewActive
        : result && !hasMeaningfulContent(getDeliverablePreviewText(result.deliverable))
          ? ui.workflow.needsReview
          : result && !result.approved
            ? ui.workflow.needsReview
            : ui.workflow.completed;

  return (
    <div className="space-y-10 animate-fade-in">
      <AiEmployeesPanel employees={aiEmployees} compact={isWorkComplete} />

      {teamSnapshot && result && (
        <TeamCollaborationPanel snapshot={teamSnapshot} />
      )}

      {!isWorkComplete && (
        <Card padding="lg" className="text-center">
          <p className="text-caption">{ui.work.currentStage}</p>
          <p className="mt-3 text-display text-foreground">{headline}</p>

          <ol className="mx-auto mt-10 flex max-w-md justify-between gap-2">
            {stages.map((stage) => (
              <li key={stage.id} className="flex flex-1 flex-col items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors duration-[var(--motion-base)]",
                    stage.status === "done" && "bg-[var(--status-success)]",
                    stage.status === "current" && "bg-accent animate-soft-pulse",
                    stage.status === "upcoming" && "bg-[var(--background-subtle)]",
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[10px] sm:text-xs",
                    stage.status === "current"
                      ? "font-medium text-foreground"
                      : "text-[var(--foreground-subtle)]",
                  )}
                >
                  {stage.status === "current" ? stage.activeLabel : stage.label}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <InternalCommunicationTimeline messages={internalMessages} />

      {error && <ErrorState message={error} />}

      {result && (
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
      )}
    </div>
  );
}
