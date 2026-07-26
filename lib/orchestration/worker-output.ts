import type {
  Deliverable,
  DeliverableType,
  WorkerDeliverablePayload,
} from "./deliverable-types";
import { classifyDeliverableType } from "./deliverable-classification";
import { extractEmailParts, normalizeEmailPayload } from "./email-deliverable";
import { isBlogRelatedRequest } from "./deliverable-types";
import {
  deliverableToWorkerPayload,
  isJsonLikeForbiddenFallback,
  logDeliverableNormalizeDebug,
  normalizeDeliverablePayload,
} from "./normalize-deliverable-payload";

export function inferDeliverableType(assignment: string, taskText = ""): DeliverableType {
  return classifyDeliverableType(assignment, taskText);
}

/** Parse a cached full Deliverable JSON blob without losing nested metadata. */
export function tryParseStoredDeliverable(text: string): Deliverable | null {
  const normalized = normalizeDeliverablePayload(text, { allowWorkerShape: true });
  logDeliverableNormalizeDebug({
    stage: "tryParseStoredDeliverable",
    rawOutputType: typeof text,
    parseSucceeded: normalized.ok,
    repairedLegacyData: normalized.ok ? normalized.repairedLegacyData : false,
    rejectedReason: normalized.ok ? undefined : normalized.errorCode,
    deliverableType: normalized.ok ? normalized.deliverable.type : undefined,
  });
  return normalized.ok ? normalized.deliverable : null;
}

/**
 * Parse worker output JSON/prose into a deliverable payload.
 *
 * IMPORTANT: JSON-like strings that fail to parse must NEVER become
 * title/summary/content. That fallback produced title="{" and JSON dumps
 * in summary/body, which leaked into UI and Word/PDF/Drive exports.
 */
export function parseWorkerDeliverablePayload(
  outputText: string,
  assignment: string,
  taskText = "",
  expectedType?: DeliverableType,
): WorkerDeliverablePayload | null {
  const trimmed = outputText.trim();
  if (!trimmed) return null;

  const inferredType = expectedType ?? classifyDeliverableType(assignment, taskText);

  const normalized = normalizeDeliverablePayload(trimmed, {
    assignment,
    expectedType: inferredType,
    allowWorkerShape: true,
  });

  if (normalized.ok) {
    logDeliverableNormalizeDebug({
      stage: "parseWorkerDeliverablePayload",
      rawOutputType: "string",
      parseSucceeded: true,
      validationSucceeded: true,
      repairedLegacyData: normalized.repairedLegacyData,
      deliverableType: normalized.deliverable.type,
    });
    const payload = deliverableToWorkerPayload(normalized.deliverable);
    if (payload.type === "email") {
      return normalizeEmailPayload(payload, assignment);
    }
    return payload;
  }

  // Forbidden: adopt raw JSON-like text as user content.
  if (isJsonLikeForbiddenFallback(trimmed)) {
    logDeliverableNormalizeDebug({
      stage: "parseWorkerDeliverablePayload",
      rawOutputType: "string",
      parseSucceeded: false,
      validationSucceeded: false,
      rejectedReason: normalized.errorCode,
      deliverableType: inferredType,
    });
    return null;
  }

  // Plain prose / email fallback only when text is clearly not internal JSON.
  if (inferredType === "email") {
    const parts = extractEmailParts(trimmed);
    const fallback: WorkerDeliverablePayload = {
      type: "email",
      title: parts.subject ? parts.subject.slice(0, 80) : "営業メール",
      summary: trimmed.slice(0, 200),
      content: trimmed,
      markdown: "",
      html: "",
      plainText: trimmed,
      tags: [],
      audience: "建設会社",
      topic: "営業メール",
    };
    return normalizeEmailPayload(fallback, assignment);
  }

  const firstLine =
    trimmed
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !isJsonLikeForbiddenFallback(line) && line !== "{" && line !== "[")
      ?.replace(/^#+\s*/, "") ?? "成果物";

  const title = isJsonLikeForbiddenFallback(firstLine) ? "成果物" : firstLine;

  return {
    type: inferredType,
    title,
    summary: trimmed.slice(0, 200),
    content: trimmed,
    markdown: trimmed,
    html: "",
    plainText: trimmed.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim(),
    tags: inferredType === "blog" || isBlogRelatedRequest(assignment) ? ["ブログ", "MINERVOT"] : [],
    seo: {
      title,
      description: trimmed.slice(0, 160),
      keywords: inferredType === "blog" ? ["ブログ", "SEO"] : [],
    },
    snsPost: inferredType === "blog" ? `新しい記事「${title}」を公開しました。` : "",
    topic: title,
    audience: "",
  };
}

export function workerPayloadHasContent(payload: WorkerDeliverablePayload | null): boolean {
  if (!payload) return false;
  if (isJsonLikeForbiddenFallback(payload.content) || isJsonLikeForbiddenFallback(payload.markdown)) {
    return false;
  }
  return Boolean(payload.content.trim() || payload.markdown.trim() || payload.title.trim());
}

/** @deprecated */
export const parseWorkerStructuredOutput = parseWorkerDeliverablePayload;

/** @deprecated */
export const workerOutputHasContent = workerPayloadHasContent;
