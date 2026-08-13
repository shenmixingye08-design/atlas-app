import { parseDeliverableContent } from "../parse-content";
import {
  detectWordPurpose,
  getWordTemplate,
  isWordTemplateId,
  type WordTemplateId,
} from "../word-templates";
import { cleanDeliverableSource } from "./clean-content";
import {
  documentModelSchema,
  parseDocumentModel,
  type DocumentModel,
  type DocumentModelBlock,
  type DocumentModelParseResult,
} from "./document-model-schema";
import { DOCUMENT_TYPE_LABELS } from "./section-templates";
import { buildStructuredDocument } from "./structure-document";
import type { DocumentBlock } from "./types";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(/\r\n/g, "\n").trim();
}

function normalizeTable(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const columnCount = Math.max(
    headers.length,
    ...rows.map((row) => row.length),
    1,
  );
  const normalizedHeaders = Array.from({ length: columnCount }, (_, i) => {
    const value = sanitizeText(headers[i] ?? "");
    return value || `列${i + 1}`;
  });
  const normalizedRows = rows
    .map((row) =>
      Array.from({ length: columnCount }, (_, i) => sanitizeText(row[i] ?? "")),
    )
    .filter((row) => row.some((cell) => cell.length > 0));

  return { headers: normalizedHeaders, rows: normalizedRows };
}

function normalizeBlocks(blocks: DocumentModelBlock[]): DocumentModelBlock[] {
  const result: DocumentModelBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph": {
        const text = sanitizeText(block.text);
        if (text) result.push({ type: "paragraph", text });
        break;
      }
      case "bulletList":
      case "numberedList": {
        const items = block.items.map(sanitizeText).filter(Boolean);
        if (items.length > 0) result.push({ ...block, items });
        break;
      }
      case "table": {
        const table = normalizeTable(block.headers, block.rows);
        if (table.headers.length > 0 && table.rows.length > 0) {
          result.push({ type: "table", ...table });
        }
        break;
      }
      case "notice": {
        const text = sanitizeText(block.text);
        if (text) result.push({ ...block, text });
        break;
      }
      case "quote": {
        const text = sanitizeText(block.text);
        if (text) result.push({ type: "quote", text });
        break;
      }
      case "keyValue": {
        const pairs = block.pairs
          .map((pair) => ({
            label: sanitizeText(pair.label),
            value: sanitizeText(pair.value) || "未記入",
          }))
          .filter((pair) => pair.label);
        if (pairs.length > 0) result.push({ type: "keyValue", pairs });
        break;
      }
      case "signature": {
        const lines = block.lines.map(sanitizeText).filter(Boolean);
        if (lines.length > 0) result.push({ type: "signature", lines });
        break;
      }
      case "imagePlaceholder": {
        const dataUrl =
          typeof block.dataUrl === "string" &&
          /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(block.dataUrl)
            ? block.dataUrl
            : undefined;
        result.push({
          type: "imagePlaceholder",
          caption: sanitizeText(block.caption) || "画像",
          ...(dataUrl ? { dataUrl } : {}),
        });
        break;
      }
      case "pageBreak":
        result.push({ type: "pageBreak" });
        break;
    }
  }
  return result;
}

function mapStructuredBlock(block: DocumentBlock): DocumentModelBlock | null {
  switch (block.type) {
    case "paragraph": {
      const text = sanitizeText(block.text);
      return text ? { type: "paragraph", text } : null;
    }
    case "bulletList":
    case "numberedList": {
      const items = block.items.map(sanitizeText).filter(Boolean);
      return items.length > 0 ? { type: block.type, items } : null;
    }
    case "table": {
      const table = normalizeTable(block.headers, block.rows);
      if (table.headers.length > 0 && table.rows.length > 0) {
        return { type: "table", ...table };
      }
      return null;
    }
    case "callout": {
      const text = sanitizeText(block.text);
      return text ? { type: "notice", variant: block.variant, text } : null;
    }
    case "keyCard": {
      const items = block.items.map(sanitizeText).filter(Boolean);
      return items.length > 0 ? { type: "bulletList", items } : null;
    }
    case "imagePlaceholder": {
      const dataUrl =
        typeof block.dataUrl === "string" &&
        /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(block.dataUrl)
          ? block.dataUrl
          : undefined;
      return {
        type: "imagePlaceholder",
        caption: sanitizeText(block.caption) || "画像",
        ...(dataUrl ? { dataUrl } : {}),
      };
    }
    default:
      return null;
  }
}

function firstPlainText(blocks: DocumentBlock[]): string {
  for (const block of blocks) {
    if (block.type === "paragraph" && block.text.trim()) return sanitizeText(block.text);
    if (
      (block.type === "bulletList" || block.type === "numberedList") &&
      block.items[0]
    ) {
      return sanitizeText(block.items[0]);
    }
  }
  return "";
}

/**
 * Convert markdown/text (existing path) into DocumentModel.
 * Uses structured section roles for Word — not a blog template.
 */
export function documentModelFromMarkdown(input: {
  content: string;
  assignment?: string;
  title?: string;
  templateId?: WordTemplateId | null;
  author?: string;
  companyName?: string;
  recipient?: string;
  createdAt?: string;
  footerNote?: string;
}): DocumentModel {
  const cleaned = cleanDeliverableSource(input.content);
  const parsed = parseDeliverableContent(cleaned);
  const purpose = detectWordPurpose({
    assignment: input.assignment ?? "",
    title: input.title ?? parsed.title,
    content: cleaned,
    explicitTemplateId: input.templateId ?? null,
  });
  const template = getWordTemplate(purpose.templateId);
  const structured = buildStructuredDocument({
    content: cleaned,
    assignment: input.assignment,
    title: input.title ?? parsed.title,
    authorLabel: input.author ?? input.companyName,
  });

  const structuredSections = [...structured.sections];
  let summary: string | undefined;
  if (structuredSections[0]?.role === "summary") {
    const extracted = firstPlainText(structuredSections[0].blocks);
    if (extracted) {
      summary = extracted;
      structuredSections.shift();
    }
  }

  const sections = structuredSections.map((section, index) => ({
    id: `section_${index + 1}`,
    level: (section.level === 1 ? 1 : 2) as 1 | 2 | 3,
    title: sanitizeText(section.title),
    blocks: section.blocks
      .map(mapStructuredBlock)
      .filter((block): block is DocumentModelBlock => Boolean(block)),
    pageBreakBefore:
      cleaned.length >= 2_800 &&
      (Boolean(section.pageBreakBefore) ||
        (template.pageBreakRule === "before_h1" &&
          section.level === 1 &&
          index > 0) ||
        (template.pageBreakRule === "before_major_sections" &&
          section.level === 1 &&
          index > 0)),
    keepWithNext: true,
  }));

  if (
    structured.meta.fields.length > 0 &&
    !sections.some((section) => section.title === "会議情報")
  ) {
    sections.unshift({
      id: "section_meta",
      level: 2,
      title: "会議情報",
      blocks: [
        {
          type: "keyValue",
          pairs: structured.meta.fields.map((field) => ({
            label: sanitizeText(field.label),
            value: sanitizeText(field.value) || "未記入",
          })),
        },
      ],
      pageBreakBefore: false,
      keepWithNext: true,
    });
  }

  const explicitTitle = input.title ? sanitizeText(input.title) : "";
  const typeLabel = DOCUMENT_TYPE_LABELS[structured.documentType];
  const subtitle =
    parsed.subtitle && parsed.subtitle !== typeLabel
      ? sanitizeText(parsed.subtitle)
      : undefined;

  const model: DocumentModel = {
    title: explicitTitle || sanitizeText(structured.title || parsed.title) || "文書",
    subtitle,
    documentType: purpose.purpose,
    templateId: purpose.templateId,
    language: "ja",
    author: input.author ? sanitizeText(input.author) : undefined,
    companyName: input.companyName ? sanitizeText(input.companyName) : undefined,
    recipient: input.recipient ? sanitizeText(input.recipient) : undefined,
    createdAt: input.createdAt,
    sections: sections.filter(
      (section) => section.title.trim() && section.blocks.length > 0,
    ),
    summary: summary || undefined,
    footerNote: input.footerNote ? sanitizeText(input.footerNote) : undefined,
    metadata: {
      purpose: purpose.purpose,
      purposeConfidence: purpose.confidence,
      matchedRule: purpose.matchedRule,
      documentIntent: structured.documentType,
      includeToc: template.includeToc || structured.includeTableOfContents,
    },
  };

  if (model.sections.length === 0) {
    model.sections = [
      {
        id: "section_1",
        level: 2,
        title: "本文",
        blocks: [{ type: "paragraph", text: sanitizeText(cleaned) || "（本文なし）" }],
      },
    ];
  }

  return documentModelSchema.parse(model);
}

/**
 * Accept structured AI JSON or free markdown.
 * Invalid structured output → normalize if possible → markdown fallback.
 */
export function resolveDocumentModel(input: {
  content: string;
  assignment?: string;
  title?: string;
  templateId?: string | null;
  author?: string;
  companyName?: string;
  recipient?: string;
  createdAt?: string;
  footerNote?: string;
  structured?: unknown;
}): DocumentModelParseResult & { model: DocumentModel } {
  const explicitTemplate =
    input.templateId && isWordTemplateId(input.templateId)
      ? input.templateId
      : null;

  if (input.structured !== undefined) {
    const parsed = parseDocumentModel(input.structured);
    if (parsed.ok) {
      const normalized: DocumentModel = {
        ...parsed.model,
        templateId: explicitTemplate ?? parsed.model.templateId,
        sections: parsed.model.sections.map((section) => ({
          ...section,
          title: sanitizeText(section.title),
          blocks: normalizeBlocks(section.blocks),
        })),
      };
      const checked = documentModelSchema.safeParse(normalized);
      if (checked.success) {
        return { ok: true, model: checked.data, source: "normalized" };
      }
    }
  }

  // Markdown / text fallback — never fail Word generation due to schema alone.
  try {
    const model = documentModelFromMarkdown({
      content: input.content,
      assignment: input.assignment,
      title: input.title,
      templateId: explicitTemplate,
      author: input.author,
      companyName: input.companyName,
      recipient: input.recipient,
      createdAt: input.createdAt,
      footerNote: input.footerNote,
    });
    return { ok: true, model, source: "normalized" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "markdown_fallback_failed";
    const fallback = documentModelSchema.parse({
      title: input.title?.trim() || "文書",
      templateId: explicitTemplate ?? "standard-document",
      language: "ja",
      sections: [
        {
          id: "section_1",
          level: 2,
          title: "本文",
          blocks: [{ type: "paragraph", text: sanitizeText(input.content) || "（本文なし）" }],
        },
      ],
    });
    return { ok: false, reason: message, model: fallback };
  }
}
