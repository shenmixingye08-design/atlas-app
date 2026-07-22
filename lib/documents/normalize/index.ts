import {
  DOCUMENT_MODEL_SCHEMA_VERSION,
  type DocumentType,
  type TemplateId,
} from "@/lib/documents/schema/enums";
import type {
  DocumentModel,
  DocumentSection,
  SectionBlock,
} from "@/lib/documents/schema/document-model.zod";
import { parseDocumentModel } from "@/lib/documents/schema/document-model.zod";
import { detectDocumentType } from "@/lib/documents/classify/detect-document-type";
import { templateForDocumentType } from "@/lib/documents/templates/registry";

const HEADING_MD = /^(#{1,3})\s+(.+)$/;
const HEADING_JA_CHAPTER = /^第([0-9一二三四五六七八九十]+)[章節部]\s*(.*)$/;
const HEADING_NUMBERED = /^(\d+(?:\.\d+)*)\.?\s+(.+)$/;
const BULLET = /^[-*•・]\s+(.+)$/;
const NUMBERED_LIST = /^\d+[.)]\s+(.+)$/;
const TABLE_SEP = /^\|?[\s:-]+\|[\s|:-]+$/;
const CHAT_FLUFF = /^(了解|承知|かしこまり|お疲れ様|ありがとう|Sure|OK|Got it)[!.。]*$/i;

/** Headings that must never become document subtitle. */
const CONTENT_SECTION_LABELS = new Set([
  "概要",
  "本文",
  "決定事項",
  "アクション",
  "議題",
  "参加者",
  "次回",
  "件名",
  "背景",
  "提案内容",
]);

function stripChatFluff(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || CHAT_FLUFF.test(trimmed)) return null;
  return trimmed;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.includes("|") && !TABLE_SEP.test(line.trim());
}

function parseCsvTableLine(line: string): string[] | null {
  if (!line.includes(",") || line.includes("|")) return null;
  const cells = line.split(",").map((c) => c.trim());
  if (cells.length < 2) return null;
  return cells;
}

function parseBlocks(lines: string[]): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const line = stripChatFluff(raw);
    if (line === null) {
      index += 1;
      continue;
    }

    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        if (!TABLE_SEP.test((lines[index] ?? "").trim())) {
          tableLines.push(lines[index]!);
        }
        index += 1;
      }
      if (tableLines.length > 0) {
        blocks.push({
          type: "table",
          headers: parseTableRow(tableLines[0]!),
          rows: tableLines.slice(1).map(parseTableRow),
        });
      }
      continue;
    }

    const csvCells = parseCsvTableLine(line);
    if (csvCells && index + 1 < lines.length) {
      const nextCsv = parseCsvTableLine(lines[index + 1] ?? "");
      if (nextCsv) {
        const rows: string[][] = [];
        let rowIndex = index;
        while (rowIndex < lines.length) {
          const cells = parseCsvTableLine(lines[rowIndex] ?? "");
          if (!cells) break;
          rows.push(cells);
          rowIndex += 1;
        }
        if (rows.length >= 2) {
          blocks.push({ type: "table", headers: rows[0]!, rows: rows.slice(1) });
          index = rowIndex;
          continue;
        }
      }
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const bulletMatch = (lines[index] ?? "").trim().match(BULLET);
        if (!bulletMatch) break;
        items.push(bulletMatch[1]!.trim());
        index += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (NUMBERED_LIST.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").trim().match(NUMBERED_LIST);
        if (!match) break;
        items.push(match[1]!.trim());
        index += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (/^>\s*(.+)$/.test(line)) {
      blocks.push({
        type: "callout",
        variant: "note",
        text: line.replace(/^>\s*/, ""),
      });
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = stripChatFluff(lines[index] ?? "");
      if (
        next === null ||
        HEADING_MD.test(next) ||
        HEADING_JA_CHAPTER.test(next) ||
        HEADING_NUMBERED.test(next) ||
        BULLET.test(next) ||
        NUMBERED_LIST.test(next) ||
        isTableRow(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

function parseHeading(line: string): { level: 1 | 2 | 3; heading: string } | null {
  const md = line.match(HEADING_MD);
  if (md) {
    return {
      level: md[1]!.length as 1 | 2 | 3,
      heading: md[2]!.trim(),
    };
  }
  const ja = line.match(HEADING_JA_CHAPTER);
  if (ja) {
    return { level: 1, heading: `第${ja[1]}章${ja[2] ? ` ${ja[2].trim()}` : ""}`.trim() };
  }
  const num = line.match(HEADING_NUMBERED);
  if (num) {
    const depth = num[1]!.split(".").length;
    const level = depth >= 3 ? 3 : depth === 2 ? 2 : 1;
    return { level: level as 1 | 2 | 3, heading: num[2]!.trim() };
  }
  return null;
}

function parseSectionsFromText(text: string): {
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
  summary?: string;
} {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let title = "資料";
  let subtitle: string | undefined;
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;
  let bodyStart = 0;
  let summary: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripChatFluff(lines[index] ?? "");
    if (!line) continue;

    const parsed = parseHeading(line);
    if (!parsed) continue;

    const { level, heading } = parsed;

    if (level === 1 && title === "資料") {
      title = heading;
      bodyStart = index + 1;
      continue;
    }

    if (level === 2 && heading === "概要" && !summary) {
      const summaryLines: string[] = [];
      let j = index + 1;
      while (j < lines.length) {
        const next = stripChatFluff(lines[j] ?? "");
        if (!next || parseHeading(next)) break;
        summaryLines.push(next);
        j += 1;
      }
      summary = summaryLines.join("\n").trim() || undefined;
      bodyStart = j;
      index = j - 1;
      continue;
    }

    if (
      level === 2 &&
      !subtitle &&
      sections.length === 0 &&
      !current &&
      !CONTENT_SECTION_LABELS.has(heading)
    ) {
      subtitle = heading;
      bodyStart = index + 1;
      continue;
    }

    if (current) {
      current.blocks = parseBlocks(lines.slice(bodyStart, index));
      sections.push(current);
    }

    current = { heading, level, blocks: [] };
    bodyStart = index + 1;
  }

  if (current) {
    current.blocks = parseBlocks(lines.slice(bodyStart));
    sections.push(current);
  }

  if (sections.length === 0) {
    sections.push({
      heading: "本文",
      level: 1,
      blocks: parseBlocks(lines.filter((l) => stripChatFluff(l) !== null)),
    });
  }

  return { title, subtitle, sections, summary };
}

/** Normalize plain text / markdown / embedded JSON into DocumentModel. */
export function normalizeToDocumentModel(
  input: string,
  options?: {
    title?: string;
    documentType?: DocumentType;
    templateId?: TemplateId;
    language?: string;
  },
): DocumentModel {
  const trimmed = input.trim();
  let jsonCandidate: unknown = null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        jsonCandidate = parsed;
      }
    } catch {
      jsonCandidate = null;
    }
  }

  const fromJson = parseDocumentModel(jsonCandidate);
  if (fromJson) {
    return fromJson;
  }

  if (jsonCandidate && typeof jsonCandidate === "object" && !Array.isArray(jsonCandidate)) {
    const partialJson = parseDocumentModel(
      normalizeLegacyJson(jsonCandidate as Record<string, unknown>),
    );
    if (partialJson) {
      return partialJson;
    }
  }

  const parsed = parseSectionsFromText(trimmed);
  const title = options?.title?.trim() || parsed.title;
  const documentType =
    options?.documentType ?? detectDocumentType(trimmed, title);
  const templateId =
    options?.templateId ?? templateForDocumentType(documentType);

  return {
    schemaVersion: DOCUMENT_MODEL_SCHEMA_VERSION,
    documentType,
    templateId,
    title,
    subtitle: parsed.subtitle,
    language: options?.language ?? "ja",
    summary: parsed.summary,
    sections: parsed.sections,
    metadata: {},
  };
}

function normalizeLegacyJson(obj: Record<string, unknown>): unknown {
  if (obj.schemaVersion === DOCUMENT_MODEL_SCHEMA_VERSION) return obj;

  const title = typeof obj.title === "string" ? obj.title : "資料";
  const content = typeof obj.content === "string" ? obj.content : "";
  const summary = typeof obj.summary === "string" ? obj.summary : undefined;

  if (content) {
    const fromContent = parseSectionsFromText(content);
    return {
      schemaVersion: DOCUMENT_MODEL_SCHEMA_VERSION,
      documentType: detectDocumentType(content, title),
      templateId: templateForDocumentType(detectDocumentType(content, title)),
      title,
      summary: summary ?? fromContent.summary,
      language: "ja",
      sections: fromContent.sections,
    };
  }

  return null;
}

/** Convert DocumentModel to markdown-like text for legacy consumers. */
export function documentModelToMarkdown(model: DocumentModel): string {
  const lines: string[] = [`# ${model.title}`];
  if (model.subtitle) lines.push(`## ${model.subtitle}`);
  if (model.summary) {
    lines.push("", "## 概要", model.summary);
  }
  lines.push("");

  for (const section of model.sections) {
    lines.push(`${"#".repeat(section.level)} ${section.heading}`);
    for (const block of section.blocks) {
      switch (block.type) {
        case "paragraph":
          lines.push(block.text);
          break;
        case "bullets":
          for (const item of block.items) lines.push(`- ${item}`);
          break;
        case "table":
          lines.push(`| ${block.headers.join(" | ")} |`);
          lines.push(`| ${block.headers.map(() => "---").join(" | ")} |`);
          for (const row of block.rows) {
            lines.push(`| ${row.join(" | ")} |`);
          }
          break;
        case "callout":
          lines.push(`> ${block.text}`);
          break;
      }
    }
    lines.push("");
  }

  if (model.actionItems?.length) {
    lines.push("## アクションアイテム");
    for (const item of model.actionItems) {
      lines.push(`- ${item.text}${item.dueDate ? ` (${item.dueDate})` : ""}`);
    }
  }

  return lines.join("\n").trim();
}
