import { extractSocialPosts } from "./core-workflow";
import type { Deliverable } from "./deliverable-types";
import { extractEmailParts } from "./email-deliverable";
import {
  isForbiddenTitle,
  looksLikeDeliverableJson,
  normalizeDeliverablePayload,
  sanitizeUserVisibleText,
} from "./normalize-deliverable-payload";

// Re-export sanitize helper used by display/export with a stable name.
function sanitizeUserVisibleTextLocal(text: string): string {
  return sanitizeUserVisibleText(text);
}

/** True when text looks like a serialized Deliverable / worker JSON object. */
export function isDeliverableJsonText(text: string): boolean {
  return looksLikeDeliverableJson(text);
}

/** Strip embedded deliverable JSON from a body field before rendering. */
export function sanitizeBodyTextForDisplay(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (looksLikeDeliverableJson(trimmed)) {
    const normalized = normalizeDeliverablePayload(trimmed);
    if (!normalized.ok) return "";
    const body =
      normalized.deliverable.content ||
      normalized.deliverable.markdown ||
      normalized.deliverable.plainText;
    if (body && !looksLikeDeliverableJson(body)) return body;
    return "";
  }

  return sanitizeUserVisibleTextLocal(trimmed);
}

function sanitizeTitleForDisplay(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  if (isForbiddenTitle(trimmed) || looksLikeDeliverableJson(trimmed)) return "";
  return trimmed;
}

function sanitizeSummaryForDisplay(summary: string): string {
  return sanitizeBodyTextForDisplay(summary);
}

/** Coalesce fields when worker output was left as JSON inside content/markdown. */
export function normalizeDeliverableForDisplay(deliverable: Deliverable): Deliverable {
  const normalized = normalizeDeliverablePayload(deliverable);
  let next = normalized.ok ? normalized.deliverable : deliverable;

  // Extra display hardening even if normalize partially failed.
  next = {
    ...next,
    title: sanitizeTitleForDisplay(next.title) || (next.type === "email" ? "営業メール" : "成果物"),
    summary: sanitizeSummaryForDisplay(next.summary),
    content: sanitizeBodyTextForDisplay(next.content),
    markdown: sanitizeBodyTextForDisplay(next.markdown),
    plainText: sanitizeBodyTextForDisplay(next.plainText),
  };

  // If title was a brace leftover and body fields still hold JSON, try once more.
  if (
    (!next.content && !next.markdown) ||
    looksLikeDeliverableJson(deliverable.content) ||
    looksLikeDeliverableJson(deliverable.markdown)
  ) {
    const repaired = normalizeDeliverablePayload({
      ...deliverable,
      title: isForbiddenTitle(deliverable.title) ? "" : deliverable.title,
    });
    if (repaired.ok) {
      next = {
        ...repaired.deliverable,
        title:
          sanitizeTitleForDisplay(repaired.deliverable.title) ||
          (repaired.deliverable.type === "email" ? "営業メール" : "成果物"),
        summary: sanitizeSummaryForDisplay(repaired.deliverable.summary),
        content: sanitizeBodyTextForDisplay(repaired.deliverable.content),
        markdown: sanitizeBodyTextForDisplay(repaired.deliverable.markdown),
        plainText: sanitizeBodyTextForDisplay(repaired.deliverable.plainText),
      };
    }
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
    subject: sanitizeTitleForDisplay(subject) || (!looksLikeDeliverableJson(subject) ? subject : ""),
    body,
    summary: sanitizeSummaryForDisplay(normalized.summary),
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

/** True when a deliverable can be shown as a completed result card. */
export function deliverableIsDisplaySafe(deliverable: Deliverable): boolean {
  const normalized = normalizeDeliverableForDisplay(deliverable);
  if (isForbiddenTitle(normalized.title) && looksLikeDeliverableJson(deliverable.title)) {
    return false;
  }
  const body = getDocumentBody(normalized);
  if (normalized.type === "social_post") {
    return getSocialPostCards(normalized).length > 0;
  }
  if (normalized.type === "email") {
    return Boolean(getEmailDisplayFields(normalized).body.trim());
  }
  return Boolean(body.trim()) && !looksLikeDeliverableJson(body);
}
