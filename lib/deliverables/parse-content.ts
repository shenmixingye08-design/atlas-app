/** Block-level element parsed from the final deliverable text. */
import { ui } from "@/lib/i18n";

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "imagePlaceholder"; caption: string };

/** A logical section (usually from `##` headings). */
export type ParsedSection = {
  title: string;
  level: 1 | 2 | 3;
  blocks: ContentBlock[];
};

/** Structured document derived from markdown-like final deliverable text. */
export type ParsedDeliverable = {
  title: string;
  subtitle?: string;
  sections: ParsedSection[];
  /** True when multiple top-level sections warrant a table of contents. */
  includeTableOfContents: boolean;
};

const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/;
const BULLET_PATTERN = /^[-*•]\s+(.+)$/;
const NUMBERED_PATTERN = /^\d+[.)]\s+(.+)$/;
const TABLE_SEPARATOR_PATTERN = /^\|?[\s:-]+\|[\s|:-]+$/;
const IMAGE_PLACEHOLDER_PATTERN =
  /^!\[(.*?)\]\((?:placeholder|image-placeholder|#)\)|^\[(Image(?: placeholder)?(?:[:\s].*)?)\]$/i;
const HORIZONTAL_RULE = /^-{3,}$/;

/** Section headings produced by {@link buildExportMarkdown} — never treat as subtitle. */
const EXPORT_SECTION_LABELS = new Set([
  "概要",
  "本文",
  "件名",
  "タグ",
  "Tags",
  "SEO",
  "記事本文",
  "投稿",
  "スライド内容",
  "調査結果",
  "メール本文",
]);

function stripTaskPrefix(title: string): string {
  return title.replace(/^Task\s+\d+:\s*/i, "").trim();
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
  return line.includes("|") && !TABLE_SEPARATOR_PATTERN.test(line.trim());
}

function parseBlocks(lines: string[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";

    if (!line || HORIZONTAL_RULE.test(line)) {
      index += 1;
      continue;
    }

    const imageMatch = line.match(IMAGE_PLACEHOLDER_PATTERN);
    if (imageMatch) {
      blocks.push({
        type: "imagePlaceholder",
        caption: imageMatch[1]?.trim() || ui.generated.imagePlaceholder,
      });
      index += 1;
      continue;
    }

    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        if (!TABLE_SEPARATOR_PATTERN.test(lines[index]?.trim() ?? "")) {
          tableLines.push(lines[index]!);
        }
        index += 1;
      }

      if (tableLines.length > 0) {
        const headers = parseTableRow(tableLines[0]!);
        const rows = tableLines.slice(1).map(parseTableRow);
        blocks.push({ type: "table", headers, rows });
      }
      continue;
    }

    if (BULLET_PATTERN.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const bulletMatch = lines[index]?.trim().match(BULLET_PATTERN);
        if (!bulletMatch) break;
        items.push(bulletMatch[1]!.trim());
        index += 1;
      }
      blocks.push({ type: "bulletList", items });
      continue;
    }

    if (NUMBERED_PATTERN.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const numberedMatch = lines[index]?.trim().match(NUMBERED_PATTERN);
        if (!numberedMatch) break;
        items.push(numberedMatch[1]!.trim());
        index += 1;
      }
      blocks.push({ type: "numberedList", items });
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !HEADING_PATTERN.test(lines[index]!.trim()) &&
      !BULLET_PATTERN.test(lines[index]!.trim()) &&
      !NUMBERED_PATTERN.test(lines[index]!.trim()) &&
      !isTableRow(lines[index]!.trim()) &&
      !IMAGE_PLACEHOLDER_PATTERN.test(lines[index]!.trim()) &&
      !HORIZONTAL_RULE.test(lines[index]!.trim())
    ) {
      paragraphLines.push(lines[index]!.trim());
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

/**
 * Parse markdown-like final deliverable text into a structured document model.
 * Shared by Word and PowerPoint generators.
 */
export function parseDeliverableContent(content: string): ParsedDeliverable {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const defaultTitle = ui.generated.deliverableTitle;
  let title: string = defaultTitle;
  let subtitle: string | undefined;
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let bodyStartIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    const headingMatch = trimmed.match(HEADING_PATTERN);

    if (!headingMatch) continue;

    const level = headingMatch[1]!.length as 1 | 2 | 3;
    const headingText = stripTaskPrefix(headingMatch[2]!.trim());

    if (level === 1 && title === defaultTitle) {
      title = headingText;
      bodyStartIndex = index + 1;
      continue;
    }

    if (
      level === 2 &&
      !subtitle &&
      sections.length === 0 &&
      !currentSection &&
      !EXPORT_SECTION_LABELS.has(headingText) &&
      !/^投稿\s*\d+$/i.test(headingText)
    ) {
      subtitle = headingText;
      bodyStartIndex = index + 1;
      continue;
    }

    if (currentSection) {
      currentSection.blocks = parseBlocks(
        lines.slice(bodyStartIndex, index).map((line) => line.trimEnd()),
      );
      sections.push(currentSection);
    }

    currentSection = {
      title: headingText,
      level: level === 1 ? 1 : level === 2 ? 2 : 3,
      blocks: [],
    };
    bodyStartIndex = index + 1;
  }

  if (currentSection) {
    currentSection.blocks = parseBlocks(
      lines.slice(bodyStartIndex).map((line) => line.trimEnd()),
    );
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    sections.push({
      title: ui.generated.content,
      level: 1,
      blocks: parseBlocks(lines.map((line) => line.trimEnd())),
    });
  }

  const topLevelSections = sections.filter((section) => section.level <= 2);

  return {
    title,
    subtitle,
    sections,
    includeTableOfContents: topLevelSections.length >= 2,
  };
}

/** Flat bullet points for agenda / summary slides. */
export function extractSummaryPoints(parsed: ParsedDeliverable): string[] {
  const points: string[] = [];

  for (const section of parsed.sections.slice(0, 6)) {
    points.push(section.title);
  }

  if (points.length === 0) {
    points.push(ui.generated.completedBy);
  }

  return points;
}
