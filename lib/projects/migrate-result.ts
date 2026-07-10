import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import type { Deliverable } from "@/lib/orchestration/deliverable-types";
import {
  defaultDownloads,
  emptyDeliverable,
  getDeliverablePreviewText,
} from "@/lib/orchestration/deliverable-types";
import { hasMeaningfulContent } from "@/lib/orchestration/final-deliverable";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { inferDeliverableType, parseWorkerDeliverablePayload } from "@/lib/orchestration/worker-output";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

function isStructuredDeliverable(value: unknown): value is Deliverable {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return "type" in record && "metadata" in record && "markdown" in record;
}

function deliverableFromLegacyString(text: string, assignment: string): Deliverable {
  const payload = parseWorkerDeliverablePayload(text, assignment);
  if (!payload) return emptyDeliverable(inferDeliverableType(assignment));

  const type = payload.type ?? inferDeliverableType(assignment);
  const markdown = payload.markdown || payload.content;
  return {
    type,
    title: payload.title,
    summary: payload.summary,
    content: payload.content,
    markdown,
    html: payload.html,
    plainText: payload.plainText,
    metadata: {
      tags: payload.tags ?? [],
      seo: {
        title: payload.seo?.title || payload.title,
        description: payload.seo?.description || payload.summary,
        keywords: payload.seo?.keywords ?? payload.tags ?? [],
      },
      snsPost: payload.snsPost ?? "",
      topic: payload.topic || payload.title,
      audience: payload.audience ?? "",
      sourceTaskId: null,
      workerCount: 0,
    },
    downloads: defaultDownloads(type),
  };
}

function hydrateFromFinalResponse(
  deliverable: Deliverable,
  finalResponse: string,
): Deliverable {
  if (getDeliverablePreviewText(deliverable)) return deliverable;
  if (!hasMeaningfulContent(finalResponse)) return deliverable;

  return {
    ...deliverable,
    content: finalResponse,
    markdown: finalResponse,
    plainText: finalResponse.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim(),
    summary: deliverable.summary || finalResponse.slice(0, 200),
    title: deliverable.title || finalResponse.split("\n")[0]?.slice(0, 80) || "成果物",
  };
}

function rebuildFromExecutions(result: OrchestrationResult): Deliverable | null {
  if (result.executions.length === 0) return null;
  const rebuilt = buildDeliverable({
    assignment: result.assignment,
    executions: result.executions,
    research: result.research,
    plannerPlan: result.plannerPlan,
  });
  return getDeliverablePreviewText(rebuilt) ? rebuilt : null;
}

/** Migrate legacy persisted orchestration results to structured Deliverable shape. */
export function migrateOrchestrationResult(
  result: OrchestrationResult,
): OrchestrationResult {
  let deliverable: Deliverable;

  const rawDeliverable = (result as unknown as { deliverable?: unknown }).deliverable;

  if (typeof rawDeliverable === "string") {
    deliverable = deliverableFromLegacyString(rawDeliverable, result.assignment);
  } else if (isStructuredDeliverable(rawDeliverable)) {
    deliverable = {
      ...rawDeliverable,
      metadata: {
        tags: rawDeliverable.metadata?.tags ?? [],
        seo: rawDeliverable.metadata?.seo ?? {
          title: rawDeliverable.title,
          description: rawDeliverable.summary,
          keywords: [],
        },
        snsPost: rawDeliverable.metadata?.snsPost ?? "",
        topic: rawDeliverable.metadata?.topic ?? rawDeliverable.title,
        audience: rawDeliverable.metadata?.audience ?? "",
        sourceTaskId: rawDeliverable.metadata?.sourceTaskId ?? null,
        workerCount: rawDeliverable.metadata?.workerCount ?? 0,
      },
      downloads: rawDeliverable.downloads ?? defaultDownloads(rawDeliverable.type),
    };
  } else {
    deliverable = emptyDeliverable(inferDeliverableType(result.assignment));
  }

  if (!getDeliverablePreviewText(deliverable)) {
    const rebuilt = rebuildFromExecutions(result);
    if (rebuilt) deliverable = rebuilt;
  }

  deliverable = hydrateFromFinalResponse(deliverable, result.finalResponse ?? "");

  const sanitized: OrchestrationResult = {
    ...result,
    deliverable,
    workflow: hydrateWorkflowState({ ...result, deliverable }, result.workflow?.workflowId),
  };

  delete (sanitized as { costDebug?: unknown }).costDebug;
  delete (sanitized as { pipelineDebug?: unknown }).pipelineDebug;

  return sanitized;
}
