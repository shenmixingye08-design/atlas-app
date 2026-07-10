import type { Deliverable, DeliverableType } from "./deliverable-types";
import {
  deliverableHasContent,
  getDeliverablePreviewText,
  isBlogRelatedRequest,
} from "./deliverable-types";
import { buildDeliverable, buildFinalResponseSummary } from "./deliverable-builder";
import type {
  AgentPhaseResult,
  OrchestrationResult,
  ResearchStageResult,
  TaskExecutionResult,
} from "./types";

export { isBlogRelatedRequest };

const MIN_MEANINGFUL_LENGTH = 120;

export type FinalDeliverableInput = {
  assignment: string;
  deliverable: Deliverable;
  reviewComments: string;
  ceoComments?: string;
  research?: ResearchStageResult;
  plannerPlan?: AgentPhaseResult | null;
  plannerTasks?: AgentPhaseResult | null;
  tasks: TaskExecutionResult["task"][];
  executions: TaskExecutionResult[];
};

export type FinalDeliverableValidation = {
  ready: boolean;
  workerOutputCount: number;
  contentLength: number;
  format: DeliverableType | "empty";
};

export type FinalDeliverableDebugInfo = FinalDeliverableValidation & {
  hasFinalOutput: boolean;
  previewRenderable: boolean;
};

export type FinalOutputPreviewSource =
  | "deliverable.content"
  | "deliverable.markdown"
  | "finalResponse"
  | "fallback";

/** Read structured deliverable fields from a workflow result. */
export function readDeliverableSources(deliverable: Deliverable | unknown): {
  content: string;
  markdown: string;
  plainText: string;
} {
  if (deliverable && typeof deliverable === "object" && "type" in deliverable) {
    const record = deliverable as Deliverable;
    return {
      content: record.content?.trim() ?? "",
      markdown: record.markdown?.trim() ?? "",
      plainText: record.plainText?.trim() ?? "",
    };
  }

  const preview = getDeliverablePreviewText(deliverable);
  return { content: preview, markdown: preview, plainText: preview };
}

/** Resolve export/preview text strictly from the structured deliverable. */
export { getDeliverableExportText } from "./deliverable-export";

/** Resolve export/preview text for copy and file generation. */
export function resolveFinalOutputPreview(result: OrchestrationResult): {
  content: string;
  source: FinalOutputPreviewSource;
} {
  const { content, markdown, plainText } = readDeliverableSources(result.deliverable);

  if (markdown) {
    return { content: markdown, source: "deliverable.markdown" };
  }

  if (content) {
    return { content, source: "deliverable.content" };
  }

  if (plainText) {
    return { content: plainText, source: "deliverable.content" };
  }

  return { content: "", source: "fallback" };
}

export function hasMeaningfulContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length >= MIN_MEANINGFUL_LENGTH) return true;
  if (/^#{1,3}\s/m.test(trimmed) && trimmed.length >= 80) return true;
  return false;
}

export function logFinalDeliverableDebug(info: FinalDeliverableDebugInfo): void {
  if (process.env.NODE_ENV === "production") return;

  console.info("[ATLAS Final Deliverable]", {
    hasFinalOutput: info.hasFinalOutput,
    workerOutputs: info.workerOutputCount,
    format: info.format,
    contentLength: info.contentLength,
    previewRendered: info.previewRenderable,
    ready: info.ready,
  });
}

export function finalizeOrchestrationDeliverable(
  input: FinalDeliverableInput,
  pipelineApproved: boolean,
): {
  finalResponse: string;
  deliverable: Deliverable;
  approved: boolean;
  validation: FinalDeliverableValidation;
} {
  const deliverable = buildDeliverable({
    assignment: input.assignment,
    executions: input.executions,
    research: input.research,
    plannerPlan: input.plannerPlan,
  });

  const workerOutputCount = input.executions.filter(
    (exec) => exec.workerStatus === "completed" && exec.worker?.result.outputText.trim(),
  ).length;

  const previewText =
    deliverable.markdown || deliverable.content || deliverable.plainText;

  const validation: FinalDeliverableValidation = {
    ready: deliverableHasContent(deliverable) || hasMeaningfulContent(previewText),
    workerOutputCount,
    contentLength: previewText.trim().length,
    format: deliverableHasContent(deliverable) ? deliverable.type : "empty",
  };

  const approved = pipelineApproved && validation.ready;

  logFinalDeliverableDebug({
    ...validation,
    hasFinalOutput: validation.ready,
    previewRenderable: validation.ready,
  });

  return {
    finalResponse: buildFinalResponseSummary(deliverable),
    deliverable,
    approved,
    validation,
  };
}
