/**
 * VALUE 3 — reuse the work shape, never the previous body / numbers / PII.
 */

export type OfficeFormat = "docx" | "xlsx" | "pdf" | "pptx";

export type WordWorkShape = {
  format: "docx";
  tone: "polite" | "casual" | "neutral" | null;
  length: "short" | "long" | "neutral" | null;
  headingCount: number | null;
  outline: string[];
  hasTable: boolean;
  bulletTendency: "bullets" | "paragraphs" | "mixed" | null;
};

export type ExcelWorkShape = {
  format: "xlsx";
  columns: string[];
  freezePane: string | null;
  filterEnabled: boolean;
  formulaPatterns: string[];
  headerFill: string | null;
};

export type PdfWorkShape = {
  format: "pdf";
  headingCount: number | null;
  outline: string[];
  pageFeel: "one_pager" | "multi" | null;
  tone: WordWorkShape["tone"];
};

export type PptxWorkShape = {
  format: "pptx";
  slideCountTendency: number | null;
  titleOutline: string[];
  bulletsPerSlide: number | null;
  sectionCount: number | null;
};

export type WorkShape = WordWorkShape | ExcelWorkShape | PdfWorkShape | PptxWorkShape;

const PII_OR_AMOUNT_RE =
  /\d{2,}[,.]?\d*|¥\s*\d+|円|\d{4}-\d{2}-\d{2}|@[\w.-]+|\d{2,4}-\d{2,4}-\d{4}/;

export function extractExcelColumnsFromInstruction(text: string): string[] {
  const slash = text.match(
    /([^\n。]{1,40}(?:\/[^\n。]{1,20}){2,})/,
  );
  if (slash) {
    return slash[1]!
      .replace(/にして.*$/, "")
      .split("/")
      .map((part) => part.replace(/[、,]/g, "").trim())
      .filter((part) => part.length > 0 && part.length <= 20);
  }
  const listed = text.match(
    /列[をは]?[「『]?\s*([^」』\n]{4,80})/,
  );
  if (listed) {
    return listed[1]!
      .split(/[、,/]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function extractExcelWorkShape(input: {
  headers: readonly string[];
  rows?: readonly (readonly unknown[])[];
  freezePane?: string | null;
  filterEnabled?: boolean;
  formulas?: readonly string[];
  headerFill?: string | null;
}): ExcelWorkShape {
  const columns = input.headers
    .map((header) => String(header ?? "").trim())
    .filter((header) => header.length > 0 && !PII_OR_AMOUNT_RE.test(header));
  const formulaPatterns = (input.formulas ?? [])
    .map((formula) => String(formula).replace(/[A-Z]+\d+/g, "CELL"))
    .filter((formula) => formula.startsWith("="));
  return {
    format: "xlsx",
    columns,
    freezePane: input.freezePane ?? null,
    filterEnabled: Boolean(input.filterEnabled),
    formulaPatterns,
    headerFill: input.headerFill ?? null,
  };
}

export function applyExcelWorkShape(input: {
  shape: ExcelWorkShape;
  newRows: readonly (readonly unknown[])[];
}): {
  headers: string[];
  rows: unknown[][];
  copiedPreviousValues: boolean;
} {
  const width = input.shape.columns.length;
  const rows = input.newRows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ""),
  );
  return {
    headers: [...input.shape.columns],
    rows,
    copiedPreviousValues: false,
  };
}

export function extractWordWorkShape(input: {
  content: string;
  format?: "docx";
  tone?: WordWorkShape["tone"];
  length?: WordWorkShape["length"];
}): WordWorkShape {
  const headings = [...input.content.matchAll(/^#{1,3}\s+(.+)$/gm)].map(
    (match) => match[1]!.trim(),
  );
  const hasTable = /\|.+\|/.test(input.content) || /<table/i.test(input.content);
  const bulletLines = (input.content.match(/^[-*・]\s+/gm) ?? []).length;
  const paragraphLines = (input.content.match(/[。！？]\s*$/gm) ?? []).length;
  let bulletTendency: WordWorkShape["bulletTendency"] = null;
  if (bulletLines > 0 && bulletLines >= paragraphLines) bulletTendency = "bullets";
  else if (paragraphLines > 0 && bulletLines === 0) bulletTendency = "paragraphs";
  else if (bulletLines > 0) bulletTendency = "mixed";
  return {
    format: "docx",
    tone: input.tone ?? null,
    length: input.length ?? null,
    headingCount: headings.length > 0 ? headings.length : null,
    outline: headings,
    hasTable,
    bulletTendency,
  };
}

export function applyWordWorkShape(input: {
  shape: WordWorkShape;
  newContent: string;
}): { content: string; reusedPreviousBody: boolean } {
  const next = input.newContent.trim();
  const previousOutlineJoined = input.shape.outline.join("\n");
  const reusedPreviousBody =
    previousOutlineJoined.length > 0 &&
    next.includes(previousOutlineJoined) &&
    next.length - previousOutlineJoined.length < 20;
  return { content: next, reusedPreviousBody };
}

export function extractPdfWorkShape(input: {
  content: string;
  pageCount?: number;
  tone?: WordWorkShape["tone"];
}): PdfWorkShape {
  const word = extractWordWorkShape({ content: input.content, tone: input.tone });
  return {
    format: "pdf",
    headingCount: word.headingCount,
    outline: word.outline,
    pageFeel:
      input.pageCount === 1
        ? "one_pager"
        : input.pageCount && input.pageCount > 1
          ? "multi"
          : /A4一枚|1枚|一枚/.test(input.content)
            ? "one_pager"
            : null,
    tone: word.tone,
  };
}

export function extractPptxWorkShape(input: {
  slideTitles: readonly string[];
  bulletsPerSlide?: readonly number[];
  sectionCount?: number;
}): PptxWorkShape {
  const titles = input.slideTitles.map((title) => title.trim()).filter(Boolean);
  const bullets = input.bulletsPerSlide ?? [];
  const avg =
    bullets.length === 0
      ? null
      : Math.round(bullets.reduce((sum, n) => sum + n, 0) / bullets.length);
  return {
    format: "pptx",
    slideCountTendency: titles.length || null,
    titleOutline: titles,
    bulletsPerSlide: avg,
    sectionCount: input.sectionCount ?? null,
  };
}

export function containsForbiddenDeliverableResidue(text: string): boolean {
  return (
    /\bTODO\b/i.test(text) ||
    /\bundefined\b/i.test(text) ||
    /\bplaceholder\b/i.test(text) ||
    /lorem ipsum/i.test(text) ||
    /私はAI|I am an AI|as an AI language model/i.test(text)
  );
}

export function isSamePeriodReuseCue(text: string): boolean {
  return /今月分も|今週分も|先週と同じ形式|同じ形式で|いつもの形式|また同じ/.test(
    text,
  );
}
