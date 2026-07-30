import { ui } from "@/lib/i18n";

import { classifyDeliverableType } from "./deliverable-classification";
import type { DeliverableType } from "./deliverable-types";
import { createPipelineFailure, PipelineFailure } from "./errors";
import {
  parseWorkerDeliverablePayload,
  tryParseStoredDeliverable,
  workerPayloadHasContent,
} from "./worker-output";
import type { TaskExecutionResult } from "./types";

export class WorkerDeliverableError extends PipelineFailure {
  readonly step = "worker" as const;

  constructor(message = ui.work.workerDeliverableFailed) {
    super({
      department: "Production",
      reason: message,
      recommendedAction:
        "Retry the request. If it fails again, simplify the assignment or specify the deliverable type explicitly.",
      step: "worker",
      agentId: "worker",
    });
    this.name = "WorkerDeliverableError";
  }
}

function looksLikeNonWorkerPhaseOutput(raw: string): boolean {
  return (
    /##\s*(目的|優先事項|成果物タイプ|成功基準|ルーティング)/.test(raw) &&
    /Planner\s*→\s*Worker/i.test(raw)
  );
}

export type WorkerUsabilityResult = {
  usable: boolean;
  reason:
    | "ok"
    | "empty"
    | "non_worker_phase"
    | "unparseable"
    | "no_content";
};

/**
 * Decide whether worker output can become a deliverable.
 * Aligns with buildDeliverable / parseWorkerDeliverablePayload — plain prose
 * for document/Word types must not be rejected solely for lacking `{` JSON.
 */
export function evaluateWorkerDeliverableUsability(
  raw: string,
  assignment: string,
  expectedType: DeliverableType,
  taskText = "",
): WorkerUsabilityResult {
  const trimmed = raw.trim();
  if (!trimmed) return { usable: false, reason: "empty" };
  if (looksLikeNonWorkerPhaseOutput(trimmed)) {
    return { usable: false, reason: "non_worker_phase" };
  }
  if (tryParseStoredDeliverable(trimmed)) {
    return { usable: true, reason: "ok" };
  }

  const parsed = parseWorkerDeliverablePayload(
    trimmed,
    assignment,
    taskText,
    expectedType,
  );
  if (!parsed) return { usable: false, reason: "unparseable" };
  if (!workerPayloadHasContent(parsed)) {
    return { usable: false, reason: "no_content" };
  }
  return { usable: true, reason: "ok" };
}

function workerOutputHasUsableDeliverable(
  raw: string,
  assignment: string,
  expectedType: DeliverableType,
  taskText = "",
): boolean {
  return evaluateWorkerDeliverableUsability(
    raw,
    assignment,
    expectedType,
    taskText,
  ).usable;
}

/** Fail fast when the production stage was never run. */
export function assertWorkerStageExecuted(workerExecuted: boolean): void {
  if (!workerExecuted) {
    throw createPipelineFailure(
      "worker",
      "worker",
      ui.work.workerNotExecuted,
      "依頼内容を確認して再実行してください。",
    );
  }
}

/** Fail fast when production workers return no usable deliverable content. */
export function assertWorkersProducedDeliverables(
  executions: readonly TaskExecutionResult[],
  assignment: string,
  expectedType?: DeliverableType,
): void {
  const deliverableType = expectedType ?? classifyDeliverableType(assignment);
  const completed = executions.filter(
    (exec) => exec.workerStatus === "completed" && exec.worker?.result.outputText.trim(),
  );

  if (completed.length === 0) {
    throw createPipelineFailure(
      "worker",
      "worker",
      ui.work.workerDeliverableFailed,
      "Retry the request or reduce assignment complexity.",
    );
  }

  const evaluations = completed.map((exec) => {
    const raw = exec.worker!.result.outputText.trim();
    return evaluateWorkerDeliverableUsability(
      raw,
      assignment,
      deliverableType,
      `${exec.task.title} ${exec.task.description}`,
    );
  });

  const hasStructured = evaluations.some((item) => item.usable);

  if (!hasStructured) {
    const reason = evaluations[0]?.reason ?? "unparseable";
    console.error("[orchestrator.worker] deliverable unusable", {
      expectedType: deliverableType,
      reason,
      outputChars: completed[0]?.worker?.result.outputText.trim().length ?? 0,
      model: completed[0]?.worker?.result.model ?? null,
      responseStatus: completed[0]?.worker?.result.status ?? null,
    });
    throw createPipelineFailure(
      "worker",
      "worker",
      ui.work.workerDeliverableFailed,
      "Ensure the worker returns structured deliverable JSON with title, content, and markdown fields.",
    );
  }
}
