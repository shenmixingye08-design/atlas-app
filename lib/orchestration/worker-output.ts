import type {
  Deliverable,
  DeliverableType,
  WorkerDeliverablePayload,
} from "./deliverable-types";
import { classifyDeliverableType, deliverableTypesMatch } from "./deliverable-classification";
import { extractEmailParts, normalizeEmailPayload } from "./email-deliverable";
import { defaultDownloads, isBlogRelatedRequest } from "./deliverable-types";

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

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

const TYPE_ALIASES: Record<string, DeliverableType> = {
  blog: "blog",
  report: "report",
  proposal: "proposal",
  presentation: "presentation",
  research: "research",
  email: "email",
  social_post: "social_post",
  short_document: "short_document",
  document: "document",
};

export function inferDeliverableType(assignment: string, taskText = ""): DeliverableType {
  return classifyDeliverableType(assignment, taskText);
}

function parseSeo(value: unknown, fallbackTitle: string, fallbackSummary: string) {
  if (!value || typeof value !== "object") {
    return {
      title: fallbackTitle,
      description: fallbackSummary,
      keywords: [] as string[],
    };
  }

  const record = value as Record<string, unknown>;
  const keywords = asStringArray(record.keywords);
  return {
    title: asString(record.title) || fallbackTitle,
    description: asString(record.description) || fallbackSummary,
    keywords,
  };
}

function metadataFromRecord(record: Record<string, unknown>) {
  const metadataObj =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : null;

  const tags = metadataObj
    ? asStringArray(metadataObj.tags).length
      ? asStringArray(metadataObj.tags)
      : asStringArray(record.tags)
    : asStringArray(record.tags);

  const seo = parseSeo(
    metadataObj?.seo ?? record.seo,
    asString(record.title),
    asString(record.summary),
  );

  return {
    tags,
    seo,
    snsPost: asString(metadataObj?.snsPost) || asString(record.snsPost),
    topic: asString(metadataObj?.topic) || asString(record.topic),
    audience: asString(metadataObj?.audience) || asString(record.audience),
    subject: asString(metadataObj?.subject) || asString(record.subject),
    purpose: asString(metadataObj?.purpose) || asString(record.purpose),
    cta: asString(metadataObj?.cta) || asString(record.cta),
    posts: metadataObj
      ? asStringArray(metadataObj.posts).length
        ? asStringArray(metadataObj.posts)
        : asStringArray(record.posts)
      : asStringArray(record.posts),
  };
}

function payloadFromRecord(
  record: Record<string, unknown>,
  assignment: string,
  taskText = "",
  expectedType?: DeliverableType,
): WorkerDeliverablePayload | null {
  const title = asString(record.title);
  const content = asString(record.content) || asString(record.body);
  const markdown = asString(record.markdown) || content;
  const plainText =
    asString(record.plainText) ||
    markdown.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();

  if (!markdown && !content && !title && !plainText) {
    return null;
  }

  const summary = asString(record.summary) || plainText.slice(0, 200);
  const typeRaw = asString(record.type).toLowerCase();
  const parsedType = TYPE_ALIASES[typeRaw] ?? classifyDeliverableType(assignment, taskText);
  const type =
    expectedType && !deliverableTypesMatch(expectedType, parsedType)
      ? expectedType
      : parsedType;
  const meta = metadataFromRecord(record);
  const tags = meta.tags;

  const payload: WorkerDeliverablePayload = {
    type,
    title: title || summary.slice(0, 80) || "成果物",
    summary,
    content: content || markdown,
    markdown,
    html: asString(record.html),
    plainText,
    tags,
    seo: meta.seo,
    snsPost: meta.snsPost,
    topic: meta.topic || title,
    audience: meta.audience,
    subject: meta.subject,
    purpose: meta.purpose,
    cta: meta.cta,
    posts: meta.posts,
  };

  if (type === "email") {
    return normalizeEmailPayload(payload, assignment);
  }

  return payload;
}

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

/** Parse a cached full Deliverable JSON blob without losing nested metadata. */
export function tryParseStoredDeliverable(text: string): Deliverable | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    const record = JSON.parse(trimmed) as Record<string, unknown>;
    const typeRaw = asString(record.type).toLowerCase();
    if (!DELIVERABLE_TYPES.has(typeRaw)) return null;
    if (!record.metadata || typeof record.metadata !== "object") return null;

    const metadata = record.metadata as Deliverable["metadata"];
    const type = typeRaw as Deliverable["type"];
    const markdown = asString(record.markdown) || asString(record.content);
    const content = asString(record.content) || markdown;
    const plainText =
      asString(record.plainText) ||
      content.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();

    if (!markdown && !content && !asString(record.title)) return null;

    return {
      type,
      title: asString(record.title) || "成果物",
      summary: asString(record.summary) || plainText.slice(0, 200),
      content,
      markdown,
      html: asString(record.html),
      plainText,
      metadata,
      downloads: Array.isArray(record.downloads)
        ? (record.downloads as Deliverable["downloads"])
        : defaultDownloads(type),
    };
  } catch {
    return null;
  }
}

/** Parse worker output JSON/prose into a deliverable payload. */
export function parseWorkerDeliverablePayload(
  outputText: string,
  assignment: string,
  taskText = "",
  expectedType?: DeliverableType,
): WorkerDeliverablePayload | null {
  const trimmed = outputText.trim();
  if (!trimmed) return null;

  for (const candidate of [trimmed, stripCodeFence(trimmed)]) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const payload = payloadFromRecord(parsed, assignment, taskText, expectedType);
      if (payload) return payload;
    } catch {
      // continue
    }
  }

  const inferredType = expectedType ?? classifyDeliverableType(assignment, taskText);

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

  const title =
    trimmed.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "") ?? "成果物";

  return {
    type: inferredType,
    title,
    summary: trimmed.slice(0, 200),
    content: trimmed,
    markdown: trimmed,
    html: "",
    plainText: trimmed.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim(),
    tags: inferredType === "blog" || isBlogRelatedRequest(assignment) ? ["ブログ", "ATLAS"] : [],
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
  return Boolean(payload.content.trim() || payload.markdown.trim() || payload.title.trim());
}

/** @deprecated */
export const parseWorkerStructuredOutput = parseWorkerDeliverablePayload;

/** @deprecated */
export const workerOutputHasContent = workerPayloadHasContent;
