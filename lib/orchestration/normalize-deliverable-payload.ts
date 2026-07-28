/**
 * Unified deliverable payload normalization.
 *
 * Root cause this module closes:
 * `parseWorkerDeliverablePayload` previously fell back to raw AI text when
 * JSON.parse failed, so title became "{", and summary/content/markdown became
 * the full internal Deliverable JSON. That broken object was then saved,
 * returned by APIs, rendered in FinalOutput, and passed to Word/PDF/MD/Drive.
 *
 * All parse / repair / pre-save / pre-export paths must go through this module.
 */

import type {
  Deliverable,
  DeliverableDownload,
  DeliverableMetadata,
  DeliverableType,
  WorkerDeliverablePayload,
} from "./deliverable-types";
import { defaultDownloads, emptyDeliverable } from "./deliverable-types";

const DELIVERABLE_TYPES = new Set<string>([
  "blog",
  "report",
  "proposal",
  "presentation",
  "research",
  "email",
  "social_post",
  "short_document",
  "document",
]);

const MAX_UNWRAP_DEPTH = 2;
const MAX_NEST_DEPTH = 6;

const SAFE_USER_MESSAGE =
  "成果物の整形に失敗しました。再生成してください。";

export type NormalizeDeliverableErrorCode =
  | "EMPTY_RESPONSE"
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "NESTED_JSON_LIMIT"
  | "NO_USER_VISIBLE_CONTENT"
  | "JSON_LIKE_UNPARSEABLE";

export type NormalizeDeliverableResult =
  | {
      ok: true;
      deliverable: Deliverable;
      warnings: string[];
      repairedLegacyData: boolean;
    }
  | {
      ok: false;
      errorCode: NormalizeDeliverableErrorCode;
      safeMessage: string;
      debugDetails?: unknown;
    };

export type NormalizeDeliverableOptions = {
  assignment?: string;
  expectedType?: DeliverableType;
  /** When true, prefer WorkerDeliverablePayload-shaped fields without requiring metadata. */
  allowWorkerShape?: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Strip ``` / ```json fences when present. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced?.[1]) return fenced[1].trim();

  const embedded = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (embedded?.[1]) return embedded[1].trim();

  return trimmed;
}

/**
 * True when text looks like internal Deliverable / worker JSON and must never
 * be adopted as user-visible prose (even if JSON.parse fails).
 */
export function isJsonLikeForbiddenFallback(text: string): boolean {
  // Production Word path must tolerate missing deliverable fields (undefined/null)
  // after Clerk/JSON round-trips — never throw TypeError on .trim().
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (/```json/i.test(trimmed)) return true;
  if (/^\s*```/.test(trimmed) && /["']type["']\s*:/.test(trimmed)) return true;

  // Escaped or raw deliverable keys commonly leaked into UI.
  if (/["']type["']\s*:/.test(trimmed) && /["'](?:title|summary|content|markdown)["']\s*:/.test(trimmed)) {
    return true;
  }
  if (/\\"type\\"\s*:/.test(trimmed) || /\\"content\\"\s*:/.test(trimmed)) {
    return true;
  }

  return false;
}

/** Title values that must never render as a document heading. */
export function isForbiddenTitle(title: string): boolean {
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (trimmed === "{" || trimmed === "}" || trimmed === "[" || trimmed === "]") {
    return true;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (/^```/.test(trimmed)) return true;
  if (isJsonLikeForbiddenFallback(trimmed)) return true;
  return false;
}

/**
 * Heuristic: text appears to be (or contain) a deliverable-shaped JSON blob.
 * Unlike a strict parse check, malformed JSON still returns true so UI/export
 * can refuse it instead of showing raw braces.
 */
export function looksLikeDeliverableJson(text: string): boolean {
  return isJsonLikeForbiddenFallback(text);
}

/** Extract the first balanced `{ ... }` object from surrounding prose. */
export function extractJsonObjectText(text: string): string | null {
  const source = stripCodeFence(text);
  const start = source.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parse a raw AI / stored value into a JSON value.
 * Supports objects, fenced JSON, surrounding prose, and up to 2 string unwraps.
 */
export function parseRawJsonValue(
  raw: unknown,
  unwrapDepth = MAX_UNWRAP_DEPTH,
): { value: unknown | null; repaired: boolean; error?: NormalizeDeliverableErrorCode } {
  if (raw == null) {
    return { value: null, repaired: false, error: "EMPTY_RESPONSE" };
  }

  if (typeof raw === "object") {
    return { value: raw, repaired: false };
  }

  if (typeof raw !== "string") {
    return { value: null, repaired: false, error: "INVALID_SCHEMA" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, repaired: false, error: "EMPTY_RESPONSE" };
  }

  let current: unknown = trimmed;
  let repaired = false;

  for (let depth = 0; depth <= unwrapDepth; depth += 1) {
    if (typeof current !== "string") {
      return { value: current, repaired };
    }

    const candidate = stripCodeFence(current);
    const direct = tryParseJson(candidate);
    if (direct != null) {
      current = direct;
      if (depth > 0 || candidate !== current) repaired = true;
      continue;
    }

    const extracted = extractJsonObjectText(candidate);
    if (extracted) {
      const fromExtract = tryParseJson(extracted);
      if (fromExtract != null) {
        current = fromExtract;
        repaired = true;
        continue;
      }
    }

    if (isJsonLikeForbiddenFallback(candidate)) {
      return {
        value: null,
        repaired,
        error: depth > 0 ? "NESTED_JSON_LIMIT" : "JSON_LIKE_UNPARSEABLE",
      };
    }

    return { value: null, repaired, error: "INVALID_JSON" };
  }

  if (typeof current === "string") {
    return { value: null, repaired, error: "NESTED_JSON_LIMIT" };
  }

  return { value: current, repaired };
}

function nestDepth(value: unknown, depth = 0): number {
  if (depth > MAX_NEST_DEPTH) return depth;
  if (!value || typeof value !== "object") return depth;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (max, item) => Math.max(max, nestDepth(item, depth + 1)),
      depth,
    );
  }
  return Object.values(value as Record<string, unknown>).reduce<number>(
    (max, item) => Math.max(max, nestDepth(item, depth + 1)),
    depth,
  );
}

function parseSeo(
  value: unknown,
  fallbackTitle: string,
  fallbackSummary: string,
): DeliverableMetadata["seo"] {
  if (!value || typeof value !== "object") {
    return {
      title: fallbackTitle,
      description: fallbackSummary,
      keywords: [],
    };
  }
  const record = value as Record<string, unknown>;
  return {
    title: asString(record.title) || fallbackTitle,
    description: asString(record.description) || fallbackSummary,
    keywords: asStringArray(record.keywords),
  };
}

function metadataFromRecord(
  record: Record<string, unknown>,
  title: string,
  summary: string,
): DeliverableMetadata {
  const metadataObj =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : null;

  const tags = metadataObj
    ? asStringArray(metadataObj.tags).length
      ? asStringArray(metadataObj.tags)
      : asStringArray(record.tags)
    : asStringArray(record.tags);

  const posts = metadataObj
    ? asStringArray(metadataObj.posts).length
      ? asStringArray(metadataObj.posts)
      : asStringArray(record.posts)
    : asStringArray(record.posts);

  return {
    tags,
    seo: parseSeo(metadataObj?.seo ?? record.seo, title, summary),
    snsPost: asString(metadataObj?.snsPost) || asString(record.snsPost),
    topic: asString(metadataObj?.topic) || asString(record.topic) || title,
    audience: asString(metadataObj?.audience) || asString(record.audience),
    subject: asString(metadataObj?.subject) || asString(record.subject) || undefined,
    purpose: asString(metadataObj?.purpose) || asString(record.purpose) || undefined,
    cta: asString(metadataObj?.cta) || asString(record.cta) || undefined,
    posts: posts.length > 0 ? posts : undefined,
    sourceTaskId:
      typeof metadataObj?.sourceTaskId === "number"
        ? metadataObj.sourceTaskId
        : typeof record.sourceTaskId === "number"
          ? record.sourceTaskId
          : null,
    workerCount:
      typeof metadataObj?.workerCount === "number"
        ? metadataObj.workerCount
        : typeof record.workerCount === "number"
          ? record.workerCount
          : 0,
  };
}

function resolveType(
  record: Record<string, unknown>,
  expectedType?: DeliverableType,
): DeliverableType | null {
  const typeRaw = asString(record.type).toLowerCase();
  if (DELIVERABLE_TYPES.has(typeRaw)) {
    const parsed = typeRaw as DeliverableType;
    return expectedType ?? parsed;
  }
  if (expectedType) return expectedType;
  return null;
}

/** Remove JSON-like / forbidden values from a user-visible string field. */
export function sanitizeUserVisibleText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (looksLikeDeliverableJson(trimmed)) return "";
  if (isForbiddenTitle(trimmed) && trimmed.length <= 3) return "";
  return trimmed;
}

function sanitizeUserField(value: string): string {
  return sanitizeUserVisibleText(value);
}

function unwrapFieldJson(
  value: string,
  warnings: string[],
  field: string,
  depth: number,
): { text: string; nestedRecord: Record<string, unknown> | null; repaired: boolean } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { text: "", nestedRecord: null, repaired: false };
  }

  if (!looksLikeDeliverableJson(trimmed)) {
    return { text: trimmed, nestedRecord: null, repaired: false };
  }

  if (depth > MAX_UNWRAP_DEPTH) {
    warnings.push(`${field}: nested JSON limit`);
    return { text: "", nestedRecord: null, repaired: false };
  }

  const parsed = parseRawJsonValue(trimmed, MAX_UNWRAP_DEPTH);
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    warnings.push(`${field}: unparseable nested JSON rejected`);
    return { text: "", nestedRecord: null, repaired: false };
  }

  return {
    text: "",
    nestedRecord: parsed.value as Record<string, unknown>,
    repaired: true,
  };
}

function buildDownloads(record: Record<string, unknown>, type: DeliverableType): DeliverableDownload[] {
  if (Array.isArray(record.downloads)) {
    return record.downloads as DeliverableDownload[];
  }
  return defaultDownloads(type);
}

function recordToDeliverable(
  record: Record<string, unknown>,
  options: NormalizeDeliverableOptions,
  warnings: string[],
  repairedLegacyData: boolean,
  depth = 0,
): NormalizeDeliverableResult {
  if (depth > MAX_NEST_DEPTH) {
    return {
      ok: false,
      errorCode: "NESTED_JSON_LIMIT",
      safeMessage: SAFE_USER_MESSAGE,
      debugDetails: { stage: "recordToDeliverable", depth },
    };
  }

  if (nestDepth(record) > MAX_NEST_DEPTH) {
    return {
      ok: false,
      errorCode: "NESTED_JSON_LIMIT",
      safeMessage: SAFE_USER_MESSAGE,
    };
  }

  const type = resolveType(record, options.expectedType);
  if (!type) {
    return {
      ok: false,
      errorCode: "INVALID_SCHEMA",
      safeMessage: SAFE_USER_MESSAGE,
      debugDetails: { reason: "invalid_type", type: record.type },
    };
  }

  let title = asString(record.title);
  let summary = asString(record.summary);
  let content = asString(record.content) || asString(record.body);
  let markdown = asString(record.markdown);
  let plainText = asString(record.plainText);
  let html = asString(record.html);
  let nestedRepaired = repairedLegacyData;

  // Expand nested Deliverable JSON in body fields (legacy double-save).
  for (const field of ["content", "markdown", "plainText", "summary"] as const) {
    const current =
      field === "content"
        ? content
        : field === "markdown"
          ? markdown
          : field === "plainText"
            ? plainText
            : summary;
    const unwrapped = unwrapFieldJson(current, warnings, field, depth);
    if (unwrapped.nestedRecord) {
      nestedRepaired = true;
      const nested = recordToDeliverable(
        unwrapped.nestedRecord,
        options,
        warnings,
        true,
        depth + 1,
      );
      if (nested.ok) {
        return {
          ok: true,
          deliverable: {
            ...nested.deliverable,
            type: options.expectedType ?? nested.deliverable.type,
            title:
              !isForbiddenTitle(title) && title
                ? title
                : nested.deliverable.title,
            summary: sanitizeUserField(summary) || nested.deliverable.summary,
          },
          warnings,
          repairedLegacyData: true,
        };
      }
      if (field === "content") content = "";
      if (field === "markdown") markdown = "";
      if (field === "plainText") plainText = "";
      if (field === "summary") summary = "";
    } else if (looksLikeDeliverableJson(current)) {
      if (field === "content") content = "";
      if (field === "markdown") markdown = "";
      if (field === "plainText") plainText = "";
      if (field === "summary") summary = "";
    }
  }

  // Legacy: title is "{" while another field holds the full JSON blob.
  if (isForbiddenTitle(title)) {
    for (const candidate of [content, markdown, plainText, summary]) {
      if (!looksLikeDeliverableJson(candidate)) continue;
      const parsed = parseRawJsonValue(candidate);
      if (parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)) {
        return recordToDeliverable(
          parsed.value as Record<string, unknown>,
          options,
          warnings,
          true,
          depth + 1,
        );
      }
    }
    title = "";
  }

  title = sanitizeUserField(title);
  summary = sanitizeUserField(summary);
  content = sanitizeUserField(content);
  markdown = sanitizeUserField(markdown);
  plainText = sanitizeUserField(plainText);
  html = sanitizeUserField(html);

  if (!markdown && content) markdown = content;
  if (!content && markdown) content = markdown;
  if (!plainText) {
    plainText = (content || markdown).replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();
  }
  if (!summary) {
    summary = plainText.slice(0, 200);
  }
  if (!title) {
    title = summary.slice(0, 80) || "成果物";
  }
  if (isForbiddenTitle(title)) {
    title = "成果物";
  }

  const userVisible = Boolean(content || markdown || plainText);
  if (!userVisible) {
    return {
      ok: false,
      errorCode: "NO_USER_VISIBLE_CONTENT",
      safeMessage: SAFE_USER_MESSAGE,
    };
  }

  // Reject if any remaining user field still looks like JSON.
  for (const [field, value] of [
    ["title", title],
    ["summary", summary],
    ["content", content],
    ["markdown", markdown],
    ["plainText", plainText],
  ] as const) {
    if (value && looksLikeDeliverableJson(value)) {
      return {
        ok: false,
        errorCode: "INVALID_SCHEMA",
        safeMessage: SAFE_USER_MESSAGE,
        debugDetails: { field, reason: "json_like_user_field" },
      };
    }
  }

  const metadata = metadataFromRecord(record, title, summary);

  return {
    ok: true,
    deliverable: {
      type,
      title,
      summary,
      content,
      markdown,
      html,
      plainText,
      metadata,
      downloads: buildDownloads(record, type),
    },
    warnings,
    repairedLegacyData: nestedRepaired,
  };
}

/**
 * Normalize any raw AI / stored deliverable value into a safe Deliverable.
 * Never throws. Never adopts JSON-like strings as user prose.
 */
export function normalizeDeliverablePayload(
  raw: unknown,
  options: NormalizeDeliverableOptions = {},
): NormalizeDeliverableResult {
  if (raw == null || (typeof raw === "string" && !raw.trim())) {
    return {
      ok: false,
      errorCode: "EMPTY_RESPONSE",
      safeMessage: SAFE_USER_MESSAGE,
    };
  }

  // Already a Deliverable-like object — still re-validate / unwrap nested JSON.
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return recordToDeliverable(raw as Record<string, unknown>, options, [], false);
  }

  if (Array.isArray(raw)) {
    return {
      ok: false,
      errorCode: "INVALID_SCHEMA",
      safeMessage: SAFE_USER_MESSAGE,
      debugDetails: { reason: "array_response" },
    };
  }

  if (typeof raw !== "string") {
    return {
      ok: false,
      errorCode: "INVALID_SCHEMA",
      safeMessage: SAFE_USER_MESSAGE,
    };
  }

  const trimmed = raw.trim();

  // HTML-only responses are not deliverable JSON; treat as invalid schema for structured path.
  if (/^<!DOCTYPE|^<html[\s>]/i.test(trimmed) && !looksLikeDeliverableJson(trimmed)) {
    return {
      ok: false,
      errorCode: "INVALID_SCHEMA",
      safeMessage: SAFE_USER_MESSAGE,
      debugDetails: { reason: "html_only" },
    };
  }

  const parsed = parseRawJsonValue(trimmed);
  if (!parsed.value) {
    if (isJsonLikeForbiddenFallback(trimmed)) {
      return {
        ok: false,
        errorCode: parsed.error ?? "JSON_LIKE_UNPARSEABLE",
        safeMessage: SAFE_USER_MESSAGE,
      };
    }
    return {
      ok: false,
      errorCode: parsed.error ?? "INVALID_JSON",
      safeMessage: SAFE_USER_MESSAGE,
    };
  }

  if (typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
    return {
      ok: false,
      errorCode: "INVALID_SCHEMA",
      safeMessage: SAFE_USER_MESSAGE,
    };
  }

  return recordToDeliverable(
    parsed.value as Record<string, unknown>,
    options,
    [],
    parsed.repaired,
  );
}

/** Convert a successful normalize result into a worker payload shape. */
export function deliverableToWorkerPayload(
  deliverable: Deliverable,
): WorkerDeliverablePayload {
  return {
    type: deliverable.type,
    title: deliverable.title,
    summary: deliverable.summary,
    content: deliverable.content,
    markdown: deliverable.markdown,
    html: deliverable.html,
    plainText: deliverable.plainText,
    tags: deliverable.metadata.tags,
    seo: deliverable.metadata.seo,
    snsPost: deliverable.metadata.snsPost,
    topic: deliverable.metadata.topic,
    audience: deliverable.metadata.audience,
    subject: deliverable.metadata.subject,
    purpose: deliverable.metadata.purpose,
    cta: deliverable.metadata.cta,
    posts: deliverable.metadata.posts,
  };
}

export type PersistValidationResult =
  | { ok: true; deliverable: Deliverable }
  | {
      ok: false;
      errorCode: NormalizeDeliverableErrorCode | "UNSAFE_FOR_PERSIST";
      safeMessage: string;
      rejectedReason: string;
    };

/** Validate a deliverable immediately before DB/cache/history persistence. */
export function assertSafeDeliverableForPersistence(
  input: unknown,
  options: NormalizeDeliverableOptions = {},
): PersistValidationResult {
  const normalized = normalizeDeliverablePayload(input, options);
  if (!normalized.ok) {
    return {
      ok: false,
      errorCode: normalized.errorCode,
      safeMessage: normalized.safeMessage,
      rejectedReason: normalized.errorCode,
    };
  }

  const d = normalized.deliverable;
  const fields: Array<[string, string]> = [
    ["title", d.title],
    ["summary", d.summary],
    ["content", d.content],
    ["markdown", d.markdown],
    ["plainText", d.plainText],
  ];

  for (const [field, value] of fields) {
    if (looksLikeDeliverableJson(value) || (field === "title" && isForbiddenTitle(value))) {
      return {
        ok: false,
        errorCode: "UNSAFE_FOR_PERSIST",
        safeMessage: SAFE_USER_MESSAGE,
        rejectedReason: `${field}_json_like`,
      };
    }
  }

  if (!d.content.trim() && !d.markdown.trim() && !d.plainText.trim()) {
    return {
      ok: false,
      errorCode: "NO_USER_VISIBLE_CONTENT",
      safeMessage: SAFE_USER_MESSAGE,
      rejectedReason: "empty_body",
    };
  }

  if (!DELIVERABLE_TYPES.has(d.type)) {
    return {
      ok: false,
      errorCode: "INVALID_SCHEMA",
      safeMessage: SAFE_USER_MESSAGE,
      rejectedReason: "invalid_type",
    };
  }

  return { ok: true, deliverable: d };
}

export type ExportGuardResult =
  | { ok: true; text: string }
  | { ok: false; safeMessage: string; rejectedReason: string };

/** Guard Word/PDF/Markdown/Drive export text. */
export function assertSafeExportText(text: string): ExportGuardResult {
  if (typeof text !== "string") {
    return {
      ok: false,
      safeMessage: SAFE_USER_MESSAGE,
      rejectedReason: "empty_export",
    };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      safeMessage: SAFE_USER_MESSAGE,
      rejectedReason: "empty_export",
    };
  }
  // Reject only when the export itself is (or begins as) internal JSON —
  // normal prose that happens to mention keys like type/content must pass.
  if (looksLikeDeliverableJson(trimmed)) {
    return {
      ok: false,
      safeMessage: SAFE_USER_MESSAGE,
      rejectedReason: "json_like_export",
    };
  }
  if (
    trimmed.startsWith("{") &&
    /["']type["']\s*:/.test(trimmed) &&
    /["'](?:content|summary|title)["']\s*:/.test(trimmed)
  ) {
    return {
      ok: false,
      safeMessage: SAFE_USER_MESSAGE,
      rejectedReason: "json_keys_in_export",
    };
  }
  return { ok: true, text: trimmed };
}

/** Safe API/UI error payload when a deliverable cannot be restored. */
export function needsRegenerationResponse(message = SAFE_USER_MESSAGE) {
  return {
    status: "needs_regeneration" as const,
    message,
  };
}

/** Dev-only structured log helper — never logs full AI/user body. */
export function logDeliverableNormalizeDebug(input: {
  stage: string;
  requestId?: string;
  taskId?: string | number | null;
  rawOutputType?: string;
  parseSucceeded?: boolean;
  validationSucceeded?: boolean;
  repairedLegacyData?: boolean;
  rejectedReason?: string;
  deliverableType?: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.ATLAS_DEBUG !== "true" && process.env.NEXT_PUBLIC_ATLAS_DEBUG !== "true") {
    return;
  }
  console.info("[ATLAS deliverable-normalize]", {
    stage: input.stage,
    requestId: input.requestId ?? null,
    taskId: input.taskId ?? null,
    rawOutputType: input.rawOutputType ?? null,
    parseSucceeded: input.parseSucceeded ?? null,
    validationSucceeded: input.validationSucceeded ?? null,
    repairedLegacyData: input.repairedLegacyData ?? null,
    rejectedReason: input.rejectedReason ?? null,
    deliverableType: input.deliverableType ?? null,
  });
}

export function emptySafeDeliverable(type: DeliverableType = "document"): Deliverable {
  return emptyDeliverable(type);
}

export const DELIVERABLE_NORMALIZE_SAFE_MESSAGE = SAFE_USER_MESSAGE;
