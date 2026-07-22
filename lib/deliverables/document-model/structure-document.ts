import { formatGeneratedDate } from "../generators/shared";
import {
  parseDeliverableContent,
  type ContentBlock,
  type ParsedSection,
} from "../parse-content";
import { cleanDeliverableSource, matchCalloutLine } from "./clean-content";
import { detectDocumentType } from "./detect-document-type";
import {
  DOCUMENT_TYPE_LABELS,
  SECTION_TEMPLATES,
  type SectionSpec,
} from "./section-templates";
import { DEFAULT_DESIGN_TEMPLATE } from "./types";
import type {
  BuildStructuredDocumentInput,
  DesignTemplateId,
  DocumentBlock,
  DocumentSection,
  DocumentType,
  StructuredDocument,
} from "./types";

function normalizeHeading(value: string): string {
  return value
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function headingMatches(title: string, aliases: string[]): boolean {
  const normalized = normalizeHeading(title);
  return aliases.some((alias) => {
    const target = normalizeHeading(alias);
    return (
      normalized === target ||
      normalized.includes(target) ||
      target.includes(normalized)
    );
  });
}

function enhanceBlocks(blocks: ContentBlock[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph") {
      const callout = matchCalloutLine(block.text);
      if (callout) {
        result.push({ type: "callout", ...callout });
        continue;
      }

      // Split dense paragraphs that contain many "。"-separated sentences into bullets
      // when they look like packed key-point dumps (manuals / sales).
      const sentences = block.text
        .split(/(?<=。)/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (sentences.length >= 5 && block.text.length > 180 && !block.text.includes("\n")) {
        result.push({ type: "bulletList", items: sentences });
        continue;
      }
    }

    result.push(block);
  }

  return result;
}

function extractMetaFields(
  documentType: DocumentType,
  content: string,
  sections: ParsedSection[],
): Array<{ label: string; value: string }> {
  if (documentType !== "minutes") return [];

  const fields: Array<{ label: string; value: string }> = [];
  const patterns: Array<[string, RegExp]> = [
    ["会議名", /(?:会議名|ミーティング名)\s*[:：]\s*(.+)/],
    ["日時", /(?:日時|開催日|日付)\s*[:：]\s*(.+)/],
    ["参加者", /(?:参加者|出席者)\s*[:：]\s*(.+)/],
    ["場所", /(?:場所|会場)\s*[:：]\s*(.+)/],
  ];

  const haystack = [content, ...sections.flatMap((section) =>
    section.blocks
      .filter((block): block is Extract<ContentBlock, { type: "paragraph" }> => block.type === "paragraph")
      .map((block) => block.text),
  )].join("\n");

  for (const [label, pattern] of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]?.trim()) {
      fields.push({ label, value: match[1].trim() });
    }
  }

  return fields;
}

function takeMatchedSection(
  available: ParsedSection[],
  spec: SectionSpec,
): ParsedSection | null {
  const index = available.findIndex((section) =>
    headingMatches(section.title, spec.aliases),
  );
  if (index < 0) return null;
  const [section] = available.splice(index, 1);
  return section ?? null;
}

function blocksHaveContent(blocks: DocumentBlock[]): boolean {
  return blocks.some((block) => {
    switch (block.type) {
      case "paragraph":
      case "callout":
        return Boolean(block.text.trim());
      case "bulletList":
      case "numberedList":
        return block.items.some((item) => item.trim());
      case "table":
        return block.headers.length > 0 || block.rows.length > 0;
      case "keyCard":
        return block.items.length > 0;
      case "imagePlaceholder":
        return true;
      default:
        return false;
    }
  });
}

function promoteKeyCards(
  documentType: DocumentType,
  sections: DocumentSection[],
): DocumentSection[] {
  if (documentType !== "plan" && documentType !== "proposal" && documentType !== "sales") {
    return sections;
  }

  return sections.map((section) => {
    if (!["summary", "benefits", "issues"].includes(section.role)) return section;
    const bullet = section.blocks.find(
      (block): block is Extract<DocumentBlock, { type: "bulletList" }> =>
        block.type === "bulletList" && block.items.length >= 2,
    );
    if (!bullet) return section;

    const remaining = section.blocks.filter((block) => block !== bullet);
    return {
      ...section,
      blocks: [
        {
          type: "keyCard",
          title: section.title,
          items: bullet.items.slice(0, 6),
        },
        ...remaining,
      ],
    };
  });
}

function countTableWidth(blocks: DocumentBlock[]): number {
  let max = 0;
  for (const block of blocks) {
    if (block.type === "table") {
      max = Math.max(max, block.headers.length);
      for (const row of block.rows) max = Math.max(max, row.length);
    }
  }
  return max;
}

function orderSections(
  documentType: DocumentType,
  parsedSections: ParsedSection[],
): DocumentSection[] {
  const template = SECTION_TEMPLATES[documentType];
  const available = [...parsedSections];
  const ordered: DocumentSection[] = [];

  for (const spec of template) {
    const matched = takeMatchedSection(available, spec);
    if (!matched) continue;
    const blocks = enhanceBlocks(matched.blocks);
    if (!blocksHaveContent(blocks) && spec.optional) continue;
    ordered.push({
      role: spec.role,
      title: spec.title,
      level: matched.level === 1 ? 1 : matched.level,
      blocks,
      pageBreakBefore: spec.pageBreakBefore,
    });
  }

  // Preserve unmatched content so we never drop body text.
  for (const leftover of available) {
    const blocks = enhanceBlocks(leftover.blocks);
    if (!blocksHaveContent(blocks)) continue;
    ordered.push({
      role: `extra:${normalizeHeading(leftover.title) || "body"}`,
      title: leftover.title,
      level: leftover.level,
      blocks,
    });
  }

  if (ordered.length === 0) {
    ordered.push({
      role: "body",
      title: "本文",
      level: 1,
      blocks: [{ type: "paragraph", text: "（本文なし）" }],
    });
  }

  return promoteKeyCards(documentType, ordered);
}

function resolveDesignTemplate(value?: DesignTemplateId): DesignTemplateId {
  if (value === "standard" || value === "simple" || value === "business" || value === "report") {
    return value;
  }
  return DEFAULT_DESIGN_TEMPLATE;
}

/**
 * Convert existing generated text into a typed, template-aware document model.
 * No AI calls — pure deterministic structuring.
 */
export function buildStructuredDocument(
  input: BuildStructuredDocumentInput,
): StructuredDocument {
  const cleaned = cleanDeliverableSource(input.content);
  const documentType = detectDocumentType({
    content: cleaned,
    assignment: input.assignment,
    title: input.title,
  });
  const parsed = parseDeliverableContent(cleaned);
  const title = (input.title?.trim() || parsed.title).trim();
  const sections = orderSections(documentType, parsed.sections);
  const metaFields = extractMetaFields(documentType, cleaned, parsed.sections);
  const designTemplate = resolveDesignTemplate(input.designTemplate);
  const maxTableCols = Math.max(0, ...sections.map((section) => countTableWidth(section.blocks)));

  const includeTableOfContents =
    sections.filter((section) => section.level <= 2).length >= 3 &&
    documentType !== "minutes" &&
    documentType !== "manual";

  return {
    documentType,
    designTemplate,
    title,
    subtitle: parsed.subtitle ?? DOCUMENT_TYPE_LABELS[documentType],
    meta: {
      createdAtLabel: formatGeneratedDate(),
      authorLabel: input.authorLabel?.trim() || "MINERVOT",
      documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
      fields: metaFields,
    },
    sections,
    includeTableOfContents,
    preferLandscapeTables: maxTableCols >= 6,
  };
}

/** Lightweight outline for UI preview (client-safe). */
export function buildDocumentOutline(input: BuildStructuredDocumentInput): {
  documentType: DocumentType;
  documentTypeLabel: string;
  designTemplate: DesignTemplateId;
  title: string;
  subtitle?: string;
  sectionTitles: string[];
} {
  const structured = buildStructuredDocument(input);
  return {
    documentType: structured.documentType,
    documentTypeLabel: structured.meta.documentTypeLabel,
    designTemplate: structured.designTemplate,
    title: structured.title,
    subtitle: structured.subtitle,
    sectionTitles: structured.sections.map((section) => section.title),
  };
}
