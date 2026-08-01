import type { DeliverableFormat, DeliverableFormatDetection } from "@/lib/deliverables/types";

import { routeRequest } from "./route";
import { formatsFromParsedRequest, understandRequest } from "./understand";
import type { AttachmentMeta, ParsedRequest } from "./types";

function toDeliverableFormats(values: string[]): DeliverableFormat[] {
  const allowed: DeliverableFormat[] = [
    "docx",
    "xlsx",
    "pdf",
    "pptx",
    "md",
    "txt",
  ];
  const out: DeliverableFormat[] = [];
  for (const value of values) {
    const format = value === "markdown" ? "md" : value;
    if ((allowed as string[]).includes(format) && !out.includes(format as DeliverableFormat)) {
      out.push(format as DeliverableFormat);
    }
  }
  return out.length ? out : ["md", "txt", "pdf"];
}

/**
 * Bridge for existing detect/resolve format callers.
 * Prefer understanding when assignment is non-empty; never throws.
 */
export function detectFormatsViaUnderstanding(
  assignment: string,
  options?: {
    preferredFormat?: string | null;
    attachments?: AttachmentMeta[];
  },
): DeliverableFormatDetection {
  try {
    const parsed = understandRequest({
      assignment,
      preferredFormat: options?.preferredFormat,
      attachments: options?.attachments,
    });
    return {
      formats: toDeliverableFormats(formatsFromParsedRequest(parsed)),
      matchedRule: `request_understanding:${parsed.document_kind ?? parsed.intent}`,
    };
  } catch {
    return { formats: ["md", "txt", "pdf"], matchedRule: "request_understanding:fallback" };
  }
}

/** Attach understanding result into work/commander metadata (non-breaking). */
export function withUnderstandingMetadata(
  metadata: Record<string, unknown> | null | undefined,
  assignment: string,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  const attachmentIds = Array.isArray(base.attachmentIds)
    ? (base.attachmentIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const preferred =
    typeof base.preferredDeliverableFormat === "string"
      ? base.preferredDeliverableFormat
      : null;

  const attachments: AttachmentMeta[] = attachmentIds.map((id, index) => ({
    id,
    fileName:
      Array.isArray(base.attachments) &&
      typeof (base.attachments as Array<{ name?: string }>)[index]?.name === "string"
        ? (base.attachments as Array<{ name?: string }>)[index]!.name
        : undefined,
    mimeType:
      Array.isArray(base.attachments) &&
      typeof (base.attachments as Array<{ mimeType?: string }>)[index]?.mimeType ===
        "string"
        ? (base.attachments as Array<{ mimeType?: string }>)[index]!.mimeType
        : undefined,
  }));

  const decision = routeRequest({
    assignment,
    preferredFormat: preferred,
    attachments,
    idempotencyKey:
      typeof base.idempotencyKey === "string" ? base.idempotencyKey : null,
  });

  const formats = toDeliverableFormats(formatsFromParsedRequest(decision.parsed));

  return {
    ...base,
    requestUnderstanding: {
      requestId: decision.parsed.request_id,
      intent: decision.parsed.intent,
      executionMode: decision.parsed.execution_mode,
      documentKind: decision.parsed.document_kind,
      confidence: decision.parsed.confidence,
      needsClarification: decision.parsed.needs_clarification,
      clarificationQuestions: decision.parsed.clarification_questions,
      assumptions: decision.parsed.assumptions,
      missingFields: decision.parsed.missing_required_fields,
      routerTarget: decision.parsed.router_target,
      outputs: decision.parsed.requested_outputs,
      userSummary: decision.parsed.user_summary,
      diagnosticId: decision.parsed.diagnostic_id,
      workflowStepIds: decision.parsed.recommended_workflow.map((s) => s.stepId),
    },
    // Help resolveGenerationFormats / engine without forcing when user already selected.
    suggestedDeliverableFormats: formats,
    understandingConfidence: decision.parsed.confidence,
  };
}

export function readParsedRequestFromMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): ParsedRequest | null {
  const raw = metadata?.requestUnderstanding;
  if (!raw || typeof raw !== "object") return null;
  // Metadata stores a compact view; callers needing full parse should re-run understandRequest.
  return null;
}
