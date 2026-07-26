import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import type { Deliverable } from "@/lib/orchestration/deliverable-types";
import {
  defaultDownloads,
  emptyDeliverable,
  getDeliverablePreviewText,
} from "@/lib/orchestration/deliverable-types";
import { hasMeaningfulContent } from "@/lib/orchestration/final-deliverable";
import {
  assertSafeDeliverableForPersistence,
  isJsonLikeForbiddenFallback,
  logDeliverableNormalizeDebug,
  normalizeDeliverablePayload,
} from "@/lib/orchestration/normalize-deliverable-payload";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { inferDeliverableType, parseWorkerDeliverablePayload } from "@/lib/orchestration/worker-output";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

function isStructuredDeliverable(value: unknown): value is Deliverable {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return "type" in record && "metadata" in record && "markdown" in record;
}

function deliverableFromLegacyString(text: string, assignment: string): Deliverable {
  const normalized = normalizeDeliverablePayload(text, {
    assignment,
    expectedType: inferDeliverableType(assignment),
  });
  if (normalized.ok) {
    logDeliverableNormalizeDebug({
      stage: "migrate-legacy-string",
      parseSucceeded: true,
      repairedLegacyData: normalized.repairedLegacyData,
      deliverableType: normalized.deliverable.type,
    });
    return normalized.deliverable;
  }

  // Never promote JSON-like raw text into a deliverable.
  if (isJsonLikeForbiddenFallback(text)) {
    logDeliverableNormalizeDebug({
      stage: "migrate-legacy-string",
      parseSucceeded: false,
      rejectedReason: normalized.errorCode,
    });
    return emptyDeliverable(inferDeliverableType(assignment));
  }

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
  if (isJsonLikeForbiddenFallback(finalResponse)) return deliverable;

  const normalized = normalizeDeliverablePayload(finalResponse, {
    expectedType: deliverable.type,
  });
  if (normalized.ok) {
    return {
      ...normalized.deliverable,
      type: deliverable.type || normalized.deliverable.type,
      downloads: deliverable.downloads.length
        ? deliverable.downloads
        : normalized.deliverable.downloads,
    };
  }

  // Plain prose only — never copy JSON-like finalResponse into body fields.
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

function repairStructuredDeliverable(raw: Deliverable, assignment: string): Deliverable {
  const persist = assertSafeDeliverableForPersistence(raw, {
    assignment,
    expectedType: raw.type,
  });
  if (persist.ok) {
    logDeliverableNormalizeDebug({
      stage: "migrate-structured",
      parseSucceeded: true,
      validationSucceeded: true,
      repairedLegacyData: false,
      deliverableType: persist.deliverable.type,
    });
    return persist.deliverable;
  }

  const normalized = normalizeDeliverablePayload(raw, {
    assignment,
    expectedType: raw.type,
  });
  if (normalized.ok) {
    logDeliverableNormalizeDebug({
      stage: "migrate-structured",
      parseSucceeded: true,
      validationSucceeded: true,
      repairedLegacyData: normalized.repairedLegacyData,
      deliverableType: normalized.deliverable.type,
    });
    return normalized.deliverable;
  }

  // Attempt field-level repair from nested JSON blobs.
  for (const candidate of [raw.content, raw.markdown, raw.plainText, raw.summary]) {
    if (!candidate || !isJsonLikeForbiddenFallback(candidate)) continue;
    const nested = normalizeDeliverablePayload(candidate, {
      assignment,
      expectedType: raw.type,
    });
    if (nested.ok) {
      logDeliverableNormalizeDebug({
        stage: "migrate-structured-nested",
        parseSucceeded: true,
        repairedLegacyData: true,
        deliverableType: nested.deliverable.type,
      });
      return nested.deliverable;
    }
  }

  logDeliverableNormalizeDebug({
    stage: "migrate-structured",
    parseSucceeded: false,
    validationSucceeded: false,
    rejectedReason: persist.rejectedReason,
    deliverableType: raw.type,
  });

  // Return empty shell — UI will show regeneration guidance instead of raw JSON.
  return emptyDeliverable(raw.type || inferDeliverableType(assignment));
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
        subject: rawDeliverable.metadata?.subject,
        purpose: rawDeliverable.metadata?.purpose,
        cta: rawDeliverable.metadata?.cta,
        posts: rawDeliverable.metadata?.posts,
      },
      downloads: rawDeliverable.downloads ?? defaultDownloads(rawDeliverable.type),
    };
    deliverable = repairStructuredDeliverable(deliverable, result.assignment);
  } else {
    deliverable = emptyDeliverable(inferDeliverableType(result.assignment));
  }

  if (!getDeliverablePreviewText(deliverable)) {
    const rebuilt = rebuildFromExecutions(result);
    if (rebuilt) deliverable = repairStructuredDeliverable(rebuilt, result.assignment);
  }

  deliverable = hydrateFromFinalResponse(deliverable, result.finalResponse ?? "");

  // Final persist gate — never keep JSON-contaminated fields on the result object.
  const gated = assertSafeDeliverableForPersistence(deliverable, {
    assignment: result.assignment,
    expectedType: deliverable.type,
  });
  if (!gated.ok) {
    deliverable = emptyDeliverable(deliverable.type || inferDeliverableType(result.assignment));
  } else {
    deliverable = gated.deliverable;
  }

  const sanitized: OrchestrationResult = {
    ...result,
    deliverable,
    workflow: hydrateWorkflowState({ ...result, deliverable }, result.workflow?.workflowId),
  };

  delete (sanitized as { costDebug?: unknown }).costDebug;
  delete (sanitized as { pipelineDebug?: unknown }).pipelineDebug;

  return sanitized;
}
