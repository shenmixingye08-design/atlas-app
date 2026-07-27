import { parseDeliverableContent } from "../parse-content";
import {
  detectWordPurpose,
  getWordTemplate,
  isWordTemplateId,
  type WordTemplateId,
} from "../word-templates";
import {
  documentModelSchema,
  parseDocumentModel,
  type DocumentModel,
  type DocumentModelBlock,
  type DocumentModelParseResult,
} from "./document-model-schema";
import { cleanDeliverableSource } from "./clean-content";

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
        result.push({
          type: "imagePlaceholder",
          caption: sanitizeText(block.caption) || "画像",
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

/**
 * Convert markdown/text (existing path) into DocumentModel.
 * Preserves backward compatibility with parseDeliverableContent.
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

  const sections = parsed.sections.map((section, index) => ({
    id: `section_${index + 1}`,
    level: section.level,
    title: sanitizeText(section.title),
    blocks: normalizeBlocks(
      section.blocks.map((block): DocumentModelBlock => {
        if (block.type === "table") {
          const table = normalizeTable(block.headers, block.rows);
          return { type: "table", ...table };
        }
        return block;
      }),
    ),
    pageBreakBefore:
      template.pageBreakRule === "before_h1"
        ? section.level === 1 && index > 0
        : template.pageBreakRule === "before_major_sections"
          ? section.level === 1 && index > 0
          : false,
    keepWithNext: true,
  }));

  const explicitTitle = input.title ? sanitizeText(input.title) : "";

  const model: DocumentModel = {
    title: explicitTitle || sanitizeText(parsed.title) || "文書",
    subtitle: parsed.subtitle ? sanitizeText(parsed.subtitle) : undefined,
    documentType: purpose.purpose,
    templateId: purpose.templateId,
    language: "ja",
    author: input.author ? sanitizeText(input.author) : undefined,
    companyName: input.companyName ? sanitizeText(input.companyName) : undefined,
    recipient: input.recipient ? sanitizeText(input.recipient) : undefined,
    createdAt: input.createdAt,
    sections,
    summary: undefined,
    footerNote: input.footerNote ? sanitizeText(input.footerNote) : undefined,
    metadata: {
      purpose: purpose.purpose,
      purposeConfidence: purpose.confidence,
      matchedRule: purpose.matchedRule,
      includeToc: template.includeToc || parsed.includeTableOfContents,
    },
  };

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
