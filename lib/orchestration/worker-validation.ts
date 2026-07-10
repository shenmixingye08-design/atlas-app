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

function workerOutputHasUsableDeliverable(
  raw: string,
  assignment: string,
  expectedType: DeliverableType,
  taskText = "",
): boolean {
  if (looksLikeNonWorkerPhaseOutput(raw)) return false;
  if (tryParseStoredDeliverable(raw)) return true;

  const trimmed = raw.trim();
  const jsonCandidate =
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? trimmed;

  if (expectedType === "email" || expectedType === "social_post" || expectedType === "short_document") {
    const parsed = parseWorkerDeliverablePayload(raw, assignment, taskText, expectedType);
    return workerPayloadHasContent(parsed);
  }

  if (!jsonCandidate.startsWith("{")) {
    return false;
  }

  const parsed = parseWorkerDeliverablePayload(raw, assignment, taskText, expectedType);
  return workerPayloadHasContent(parsed);
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

  const hasStructured = completed.some((exec) => {
    const raw = exec.worker!.result.outputText.trim();
    return workerOutputHasUsableDeliverable(
      raw,
      assignment,
      deliverableType,
      `${exec.task.title} ${exec.task.description}`,
    );
  });

  if (!hasStructured) {
    throw createPipelineFailure(
      "worker",
      "worker",
      ui.work.workerDeliverableFailed,
      "Ensure the worker returns structured deliverable JSON with title, content, and markdown fields.",
    );
  }
}
