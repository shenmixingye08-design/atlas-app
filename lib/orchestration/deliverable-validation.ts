import type { Deliverable, DeliverableType } from "./deliverable-types";
import { deliverableHasContent, emptyDeliverable } from "./deliverable-types";
import { detectEmailSubject } from "./email-deliverable";
import { buildDeliverable } from "./deliverable-builder";
import type { AgentPhaseResult, ResearchStageResult, TaskExecutionResult } from "./types";
import { parseWorkerDeliverablePayload, tryParseStoredDeliverable } from "./worker-output";

const REQUIRED_DELIVERABLE_TYPES: DeliverableType[] = [
  "blog",
  "report",
  "proposal",
  "presentation",
  "research",
  "email",
  "social_post",
  "short_document",
  "document",
];

export type DeliverableFieldIssue = {
  field: string;
  reason: string;
};

export type DeliverableValidationResult = {
  valid: boolean;
  issues: DeliverableFieldIssue[];
  missingFields: string[];
};

export type EnsureDeliverableParams = {
  assignment: string;
  executions: readonly TaskExecutionResult[];
  research?: ResearchStageResult;
  plannerPlan?: AgentPhaseResult | null;
  deliverable?: Deliverable;
};

export type EnsureDeliverableResult = {
  deliverable: Deliverable;
  validation: DeliverableValidationResult;
  recovered: boolean;
  recoverySource: "none" | "worker_output" | "stored_deliverable";
};

/** Verify all required deliverable fields exist before approval. */
export function validateDeliverableFields(deliverable: Deliverable): DeliverableValidationResult {
  if (deliverable.type === "email") {
    return validateEmailDeliverableFields(deliverable);
  }

  const issues: DeliverableFieldIssue[] = [];

  if (!deliverable.type || !REQUIRED_DELIVERABLE_TYPES.includes(deliverable.type)) {
    issues.push({ field: "type", reason: "missing or invalid deliverable type" });
  }
  if (!deliverable.title.trim()) {
    issues.push({ field: "title", reason: "title is empty" });
  }
  if (!deliverable.summary.trim()) {
    issues.push({ field: "summary", reason: "summary is empty" });
  }
  if (!deliverable.content.trim()) {
    issues.push({ field: "content", reason: "content is empty" });
  }
  if (!deliverable.markdown.trim()) {
    issues.push({ field: "markdown", reason: "markdown is empty" });
  }
  if (!deliverable.plainText.trim()) {
    issues.push({ field: "plainText", reason: "plainText is empty" });
  }
  if (!deliverable.metadata || typeof deliverable.metadata !== "object") {
    issues.push({ field: "metadata", reason: "metadata is missing" });
  }

  return {
    valid: issues.length === 0 && deliverableHasContent(deliverable),
    issues,
    missingFields: issues.map((issue) => issue.field),
  };
}

function validateEmailDeliverableFields(deliverable: Deliverable): DeliverableValidationResult {
  const issues: DeliverableFieldIssue[] = [];

  if (deliverable.type !== "email") {
    issues.push({ field: "type", reason: "expected email deliverable" });
  }
  if (!deliverable.title.trim()) {
    issues.push({ field: "title", reason: "title is empty" });
  }
  if (!deliverable.content.trim()) {
    issues.push({ field: "content", reason: "content is empty" });
  }
  if (!deliverable.markdown.trim()) {
    issues.push({ field: "markdown", reason: "markdown is empty" });
  }
  if (!deliverable.plainText.trim()) {
    issues.push({ field: "plainText", reason: "plainText is empty" });
  }

  const subject = detectEmailSubject(deliverable);
  if (!subject.trim()) {
    issues.push({ field: "metadata.subject", reason: "email subject (件名) is missing" });
  }

  return {
    valid: issues.length === 0 && deliverableHasContent(deliverable),
    issues,
    missingFields: issues.map((issue) => issue.field),
  };
}

/** Attempt to rebuild a deliverable from worker output when the builder returned empty. */
export function recoverDeliverableFromExecutions(
  params: EnsureDeliverableParams,
): EnsureDeliverableResult | null {
  const completed = params.executions.filter(
    (exec) => exec.workerStatus === "completed" && exec.worker?.result.outputText.trim(),
  );

  for (const exec of completed) {
    const raw = exec.worker!.result.outputText.trim();

    const stored = tryParseStoredDeliverable(raw);
    if (stored && deliverableHasContent(stored)) {
      return {
        deliverable: stored,
        validation: validateDeliverableFields(stored),
        recovered: true,
        recoverySource: "stored_deliverable",
      };
    }

    const payload = parseWorkerDeliverablePayload(
      raw,
      params.assignment,
      `${exec.task.title} ${exec.task.description}`,
    );
    if (!payload) continue;

    const rebuilt = buildDeliverable({
      assignment: params.assignment,
      executions: [exec],
      research: params.research,
      plannerPlan: params.plannerPlan,
    });

    if (deliverableHasContent(rebuilt)) {
      return {
        deliverable: rebuilt,
        validation: validateDeliverableFields(rebuilt),
        recovered: true,
        recoverySource: "worker_output",
      };
    }
  }

  return null;
}

/**
 * Build or recover a deliverable and validate required fields.
 * Only fails when recovery is impossible.
 */
export function ensureDeliverable(params: EnsureDeliverableParams): EnsureDeliverableResult {
  const built =
    params.deliverable ??
    buildDeliverable({
      assignment: params.assignment,
      executions: params.executions,
      research: params.research,
      plannerPlan: params.plannerPlan,
    });

  let validation = validateDeliverableFields(built);
  if (validation.valid) {
    return {
      deliverable: built,
      validation,
      recovered: false,
      recoverySource: "none",
    };
  }

  const recovered = recoverDeliverableFromExecutions(params);
  if (recovered?.validation.valid) {
    return recovered;
  }

  if (recovered && deliverableHasContent(recovered.deliverable)) {
    validation = recovered.validation;
    return recovered;
  }

  return {
    deliverable: deliverableHasContent(built) ? built : emptyDeliverable(built.type),
    validation,
    recovered: false,
    recoverySource: "none",
  };
}
