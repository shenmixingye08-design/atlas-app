import type { Deliverable } from "./deliverable-types";
import { getDeliverablePreviewText } from "./deliverable-types";
import {
  getBlogTags,
  getDocumentBody,
  getEmailDisplayFields,
  getSocialPostCards,
  isDeliverableJsonText,
  normalizeDeliverableForDisplay,
  sanitizeBodyTextForDisplay,
} from "./deliverable-display";

function exportSection(title: string, body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  return ["", `## ${title}`, "", trimmed, ""];
}

function joinExportParts(parts: string[][]): string {
  const text = parts.flat().join("\n").trimEnd();
  return text ? `${text}\n` : "";
}

/** Build clean markdown export text aligned with FinalOutput display. */
export function buildExportMarkdown(deliverable: Deliverable): string {
  const normalized = normalizeDeliverableForDisplay(deliverable);

  switch (normalized.type) {
    case "email": {
      const { subject, body, summary } = getEmailDisplayFields(normalized);
      return joinExportParts([
        ["# 営業メール"],
        exportSection("件名", subject || "（件名なし）"),
        exportSection("本文", body),
        exportSection("概要", summary),
      ]);
    }
    case "blog": {
      const title = normalized.title.trim() || "タイトル";
      const tags = getBlogTags(normalized);
      return joinExportParts([
        [`# ${title}`],
        exportSection("概要", normalized.summary),
        exportSection("本文", getDocumentBody(normalized)),
        tags.length > 0 ? exportSection("タグ", tags.join(" · ")) : [],
      ]);
    }
    case "social_post": {
      const posts = getSocialPostCards(normalized);
      const parts: string[][] = [[`# ${normalized.title.trim() || "SNS投稿"}`]];
      posts.forEach((post, index) => {
        parts.push(exportSection(`投稿 ${index + 1}`, post));
      });
      return joinExportParts(parts);
    }
    case "proposal":
    case "report":
    case "document":
    case "presentation":
    case "research":
    case "short_document":
    default: {
      const title = normalized.title.trim() || "成果物";
      return joinExportParts([
        [`# ${title}`],
        exportSection("概要", normalized.summary),
        exportSection("本文", getDocumentBody(normalized)),
      ]);
    }
  }
}

/** Single export source for copy, markdown, Word, and PDF. */
export function getDeliverableExportText(deliverable: Deliverable | unknown): string {
  if (deliverable && typeof deliverable === "object" && "type" in deliverable) {
    const markdown = buildExportMarkdown(deliverable as Deliverable);
    if (markdown.trim()) return markdown;
  }

  const fallback = sanitizeBodyTextForDisplay(getDeliverablePreviewText(deliverable));
  if (fallback && !isDeliverableJsonText(fallback)) {
    return `${fallback.trimEnd()}\n`;
  }

  return "";
}
