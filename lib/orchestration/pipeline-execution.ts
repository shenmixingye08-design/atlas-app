import { ui } from "@/lib/i18n";

import { deliverableHasContent } from "./deliverable-types";
import type { Deliverable } from "./deliverable-types";
import type { OrchestrationStep, OrchestrationStepError } from "./types";

export type DeliverableBuilderInputSource = "worker" | "cache" | "recovery" | "none";

/** Pipeline stage execution flags surfaced in Workflow Inspector. */
export type PipelineExecutionDebug = {
  plannerExecuted: boolean;
  workerExecuted: boolean;
  workerOutputExists: boolean;
  deliverableBuilderInputSource: DeliverableBuilderInputSource;
  needsReviewReason: string | null;
  failedStage: OrchestrationStep | null;
};

export function createInitialPipelineExecutionDebug(): PipelineExecutionDebug {
  return {
    plannerExecuted: false,
    workerExecuted: false,
    workerOutputExists: false,
    deliverableBuilderInputSource: "none",
    needsReviewReason: null,
    failedStage: null,
  };
}

export function workerPhaseHasOutput(outputText: string | undefined | null): boolean {
  return Boolean(outputText?.trim());
}

type NeedsReviewInput = {
  approved: boolean;
  deliverable: Deliverable;
  warnings?: string[];
  stepError?: OrchestrationStepError;
  pipeline: PipelineExecutionDebug;
};

/** Derive the exact 要確認 reason for inspector and UI surfacing. */
export function computeNeedsReviewReason(input: NeedsReviewInput): string | null {
  const { approved, deliverable, warnings, stepError, pipeline } = input;

  if (stepError) {
    return stepError.message;
  }

  if (!pipeline.plannerExecuted) {
    return "Planner が実行されませんでした。";
  }

  if (!pipeline.workerExecuted) {
    return ui.work.workerNotExecuted;
  }

  if (!pipeline.workerOutputExists) {
    return ui.work.workerDeliverableFailed;
  }

  if (!deliverableHasContent(deliverable)) {
    if (pipeline.deliverableBuilderInputSource === "none") {
      return "Deliverable Builder — Worker 出力から成果物を構築できませんでした。";
    }
    return "Deliverable Builder did not produce usable content.";
  }

  const reviewWarning = warnings?.find((warning) => warning.includes("要確認"));
  if (reviewWarning) {
    return reviewWarning;
  }

  if (!approved) {
    return ui.work.deliverableNeedsReview;
  }

  return null;
}

export function inferFailedStageFromPipeline(
  pipeline: PipelineExecutionDebug,
): OrchestrationStep | null {
  if (pipeline.failedStage) return pipeline.failedStage;
  if (!pipeline.plannerExecuted) return "planner_plan";
  if (!pipeline.workerExecuted || !pipeline.workerOutputExists) return "worker";
  if (pipeline.deliverableBuilderInputSource === "none") return "final_deliverable";
  return null;
}
