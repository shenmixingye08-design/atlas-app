import { extractSocialPosts } from "./core-workflow";
import type { Deliverable, DeliverableType } from "./deliverable-types";
import { extractEmailParts } from "./email-deliverable";
import { tryParseStoredDeliverable } from "./worker-output";

const DISPLAY_TYPES = new Set<string>([
  "email",
  "blog",
  "social_post",
  "proposal",
  "report",
  "document",
  "presentation",
  "research",
  "short_document",
]);

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

/** True when text looks like a serialized Deliverable / worker JSON object. */
export function isDeliverableJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return false;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const type = asString(parsed.type).toLowerCase();
    return DISPLAY_TYPES.has(type) || "title" in parsed || "content" in parsed || "body" in parsed;
  } catch {
    return false;
  }
}

function parseDeliverableJsonRecord(text: string): Record<string, unknown> | null {
  if (!isDeliverableJsonText(text)) return null;
  try {
    return JSON.parse(text.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function metadataFromRecord(
  record: Record<string, unknown>,
  base: Deliverable["metadata"],
): Deliverable["metadata"] {
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
    ...base,
    tags: tags.length > 0 ? tags : base.tags,
    posts: posts.length > 0 ? posts : base.posts,
    snsPost: asString(metadataObj?.snsPost) || asString(record.snsPost) || base.snsPost,
    topic: asString(metadataObj?.topic) || asString(record.topic) || base.topic,
    audience: asString(metadataObj?.audience) || asString(record.audience) || base.audience,
    subject: asString(metadataObj?.subject) || asString(record.subject) || base.subject,
    purpose: asString(metadataObj?.purpose) || asString(record.purpose) || base.purpose,
    cta: asString(metadataObj?.cta) || asString(record.cta) || base.cta,
  };
}

function bodyFromRecord(record: Record<string, unknown>): string {
  return (
    asString(record.content) ||
    asString(record.body) ||
    asString(record.markdown) ||
    asString(record.plainText)
  );
}

function mergeDeliverableFromJson(base: Deliverable, record: Record<string, unknown>): Deliverable {
  const stored = tryParseStoredDeliverable(JSON.stringify(record));
  if (stored && !isDeliverableJsonText(stored.content) && !isDeliverableJsonText(stored.markdown)) {
    const storedTags = stored.metadata.tags ?? [];
    const storedPosts = stored.metadata.posts ?? [];
    return {
      ...stored,
      title: stored.title || base.title,
      summary: stored.summary || base.summary,
      metadata: {
        ...stored.metadata,
        tags: storedTags.length > 0 ? storedTags : base.metadata.tags,
        posts: storedPosts.length > 0 ? storedPosts : base.metadata.posts,
      },
    };
  }

  const typeRaw = asString(record.type).toLowerCase();
  const type = (DISPLAY_TYPES.has(typeRaw) ? typeRaw : base.type) as DeliverableType;
  const body = bodyFromRecord(record);
  const resolvedBody = isDeliverableJsonText(body) ? sanitizeBodyTextForDisplay(body) : body;

  return {
    ...base,
    type,
    title: asString(record.title) || base.title,
    summary: asString(record.summary) || base.summary,
    content: resolvedBody || base.content,
    markdown:
      asString(record.markdown) && !isDeliverableJsonText(asString(record.markdown))
        ? asString(record.markdown)
        : resolvedBody || base.markdown,
    plainText:
      asString(record.plainText) && !isDeliverableJsonText(asString(record.plainText))
        ? asString(record.plainText)
        : base.plainText,
    metadata: metadataFromRecord(record, base.metadata),
  };
}

/** Strip embedded deliverable JSON from a body field before rendering. */
export function sanitizeBodyTextForDisplay(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (isDeliverableJsonText(trimmed)) {
    const record = parseDeliverableJsonRecord(trimmed);
    if (!record) return "";
    const body = bodyFromRecord(record);
    if (body && !isDeliverableJsonText(body)) return body;
    return "";
  }

  return trimmed;
}

/** Coalesce fields when worker output was left as JSON inside content/markdown. */
export function normalizeDeliverableForDisplay(deliverable: Deliverable): Deliverable {
  let next = deliverable;

  for (const field of ["content", "markdown", "plainText"] as const) {
    const value = next[field]?.trim() ?? "";
    if (!isDeliverableJsonText(value)) continue;
    const record = parseDeliverableJsonRecord(value);
    if (record) next = mergeDeliverableFromJson(next, record);
  }

  if (next.type === "email") {
    const bodyCandidate =
      sanitizeBodyTextForDisplay(extractEmailParts(next.content).body) ||
      sanitizeBodyTextForDisplay(extractEmailParts(next.markdown).body) ||
      sanitizeBodyTextForDisplay(next.content);

    if (bodyCandidate && bodyCandidate !== next.content) {
      next = { ...next, content: bodyCandidate };
    }
  }

  return next;
}

export type EmailDisplayFields = {
  subject: string;
  body: string;
  summary: string;
};

export function getEmailDisplayFields(deliverable: Deliverable): EmailDisplayFields {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  const subject =
    normalized.metadata.subject?.trim() ||
    extractEmailParts(normalized.content).subject ||
    extractEmailParts(normalized.markdown).subject ||
    "";

  const body =
    sanitizeBodyTextForDisplay(extractEmailParts(normalized.content).body) ||
    sanitizeBodyTextForDisplay(extractEmailParts(normalized.markdown).body) ||
    sanitizeBodyTextForDisplay(normalized.content) ||
    sanitizeBodyTextForDisplay(normalized.markdown);

  return {
    subject,
    body,
    summary: normalized.summary.trim(),
  };
}

export function getDocumentBody(deliverable: Deliverable): string {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  return (
    sanitizeBodyTextForDisplay(normalized.content) ||
    sanitizeBodyTextForDisplay(normalized.markdown) ||
    sanitizeBodyTextForDisplay(normalized.plainText)
  );
}

export function getSocialPostCards(deliverable: Deliverable): string[] {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  const posts = extractSocialPosts(normalized).map((post) => sanitizeBodyTextForDisplay(post));
  return posts.filter(Boolean);
}

export function getBlogTags(deliverable: Deliverable): string[] {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  const tags = normalized.metadata.tags.filter(Boolean);
  if (tags.length > 0) return tags;
  return normalized.metadata.seo.keywords.filter(Boolean);
}
