import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock, ParsedDeliverable } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import {
  loadPdfFontForSubset,
  splitTextBySubset,
  subsetIndexForCodePoint,
} from "../fonts/japanese-pdf-fonts";
import { createDeliverableFile } from "./shared";

export { subsetIndexForCodePoint } from "../fonts/japanese-pdf-fonts";

type PdfFonts = Map<number, PDFFont>;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TABLE_FONT_SIZE = 9;
const TABLE_LINE_HEIGHT = 12;
const TABLE_CELL_PAD_X = 3;
const TABLE_CELL_PAD_Y = 3;
const TABLE_MAX_COLS = 12;
const TABLE_MAX_ROWS = 200;

type DrawCursor = {
  page: PDFPage;
  y: number;
};

export type PdfTableRenderStats = {
  sourceTableCount: number;
  renderedTableCount: number;
};

/** Count table blocks in parsed deliverable (P1-01). */
export function countSourcePdfTables(parsed: ParsedDeliverable): number {
  let count = 0;
  for (const section of parsed.sections) {
    for (const block of section.blocks) {
      if (block.type === "table") count += 1;
    }
  }
  return count;
}

function wrapText(text: string, font: PDFFont, size: number): string[] {
  return wrapTextToWidth(text, font, size, CONTENT_WIDTH);
}

function wrapTextToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const char of paragraph) {
      const candidate = line + char;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function ensureSpace(
  pdfDoc: PDFDocument,
  cursor: DrawCursor,
  needed: number,
): void {
  if (cursor.y - needed < MARGIN) {
    cursor.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - MARGIN;
  }
}

async function wrapCellText(params: {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  text: string;
  maxWidth: number;
}): Promise<string[]> {
  const probeFont = await loadPdfFontForSubset(
    params.pdfDoc,
    params.fonts,
    subsetIndexForCodePoint(params.text.codePointAt(0) ?? 0x41),
  );
  // Approximate wrap using primary subset; draw path still uses multi-subset.
  return wrapTextToWidth(
    params.text,
    probeFont,
    TABLE_FONT_SIZE,
    Math.max(8, params.maxWidth),
  );
}

async function drawTextRun(params: {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  size: number;
}): Promise<number> {
  let drawX = params.x;
  for (const run of splitTextBySubset(params.text)) {
    const font = await loadPdfFontForSubset(
      params.pdfDoc,
      params.fonts,
      run.index,
    );
    params.page.drawText(run.text, {
      x: drawX,
      y: params.y,
      size: params.size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    drawX += font.widthOfTextAtSize(run.text, params.size);
  }
  return drawX - params.x;
}

async function drawWrappedText(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  text: string;
  x: number;
  size: number;
  lineHeight: number;
}): Promise<void> {
  for (const paragraph of params.text.split("\n")) {
    if (!paragraph.trim()) {
      ensureSpace(params.pdfDoc, params.cursor, params.lineHeight);
      params.cursor.y -= params.lineHeight * 0.6;
      continue;
    }

    const runs = splitTextBySubset(paragraph);
    let line = "";

    const flushLine = async () => {
      if (!line) return;
      ensureSpace(params.pdfDoc, params.cursor, params.lineHeight);
      let drawX = params.x;
      for (const run of splitTextBySubset(line)) {
        const font = await loadPdfFontForSubset(
          params.pdfDoc,
          params.fonts,
          run.index,
        );
        params.cursor.page.drawText(run.text, {
          x: drawX,
          y: params.cursor.y,
          size: params.size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        drawX += font.widthOfTextAtSize(run.text, params.size);
      }
      params.cursor.y -= params.lineHeight;
      line = "";
    };

    for (const run of runs) {
      for (const char of run.text) {
        const font = await loadPdfFontForSubset(
          params.pdfDoc,
          params.fonts,
          run.index,
        );
        const candidate = line + char;
        const width = font.widthOfTextAtSize(candidate, params.size);
        if (width > CONTENT_WIDTH && line) {
          await flushLine();
          line = char;
        } else {
          line = candidate;
        }
      }
    }

    await flushLine();
  }
}

async function drawTableBlock(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  headers: string[];
  rows: string[][];
}): Promise<void> {
  const colCount = Math.max(
    params.headers.length,
    ...params.rows.map((row) => row.length),
    0,
  );
  if (colCount <= 0) {
    throw new Error("pdf_table_empty");
  }
  if (colCount > TABLE_MAX_COLS) {
    throw new Error(`pdf_table_too_wide:${colCount}`);
  }
  if (params.rows.length + 1 > TABLE_MAX_ROWS) {
    throw new Error(`pdf_table_too_tall:${params.rows.length + 1}`);
  }

  const colWidth = CONTENT_WIDTH / colCount;
  const textWidth = Math.max(8, colWidth - TABLE_CELL_PAD_X * 2);

  type PreparedRow = {
    cells: string[][];
    height: number;
    header: boolean;
  };

  const prepareRow = async (
    cells: string[],
    header: boolean,
  ): Promise<PreparedRow> => {
    const wrapped: string[][] = [];
    let maxLines = 1;
    for (let c = 0; c < colCount; c += 1) {
      const raw = (cells[c] ?? "").trim() || " ";
      const lines = await wrapCellText({
        pdfDoc: params.pdfDoc,
        fonts: params.fonts,
        text: raw,
        maxWidth: textWidth,
      });
      wrapped.push(lines.length > 0 ? lines : [" "]);
      maxLines = Math.max(maxLines, wrapped[c]!.length);
    }
    const height =
      maxLines * TABLE_LINE_HEIGHT + TABLE_CELL_PAD_Y * 2;
    return { cells: wrapped, height, header };
  };

  const prepared: PreparedRow[] = [
    await prepareRow(params.headers, true),
    ...(await Promise.all(
      params.rows.map((row) => prepareRow(row, false)),
    )),
  ];

  for (const row of prepared) {
    ensureSpace(params.pdfDoc, params.cursor, row.height + 2);
    const top = params.cursor.y;
    const bottom = top - row.height;

    for (let c = 0; c < colCount; c += 1) {
      const x = MARGIN + c * colWidth;
      if (row.header) {
        params.cursor.page.drawRectangle({
          x,
          y: bottom,
          width: colWidth,
          height: row.height,
          color: rgb(0.9, 0.93, 0.96),
          borderColor: rgb(0.55, 0.6, 0.65),
          borderWidth: 0.6,
        });
      } else {
        params.cursor.page.drawRectangle({
          x,
          y: bottom,
          width: colWidth,
          height: row.height,
          borderColor: rgb(0.55, 0.6, 0.65),
          borderWidth: 0.6,
        });
      }

      const lines = row.cells[c] ?? [" "];
      let textY = top - TABLE_CELL_PAD_Y - TABLE_FONT_SIZE;
      for (const line of lines) {
        await drawTextRun({
          pdfDoc: params.pdfDoc,
          fonts: params.fonts,
          page: params.cursor.page,
          text: line,
          x: x + TABLE_CELL_PAD_X,
          y: textY,
          size: TABLE_FONT_SIZE,
        });
        textY -= TABLE_LINE_HEIGHT;
      }
    }

    params.cursor.y = bottom;
  }

  params.cursor.y -= 8;
}

async function drawBlocks(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  blocks: ContentBlock[];
  stats: PdfTableRenderStats;
}): Promise<void> {
  for (const block of params.blocks) {
    switch (block.type) {
      case "paragraph":
        await drawWrappedText({
          pdfDoc: params.pdfDoc,
          cursor: params.cursor,
          fonts: params.fonts,
          text: block.text,
          x: MARGIN,
          size: 11,
          lineHeight: 16,
        });
        params.cursor.y -= 6;
        break;
      case "bulletList":
        for (const item of block.items) {
          await drawWrappedText({
            pdfDoc: params.pdfDoc,
            cursor: params.cursor,
            fonts: params.fonts,
            text: `・ ${item}`,
            x: MARGIN + 12,
            size: 11,
            lineHeight: 16,
          });
        }
        params.cursor.y -= 4;
        break;
      case "numberedList":
        for (let index = 0; index < block.items.length; index += 1) {
          await drawWrappedText({
            pdfDoc: params.pdfDoc,
            cursor: params.cursor,
            fonts: params.fonts,
            text: `${index + 1}. ${block.items[index]}`,
            x: MARGIN + 12,
            size: 11,
            lineHeight: 16,
          });
        }
        params.cursor.y -= 4;
        break;
      case "table":
        await drawTableBlock({
          pdfDoc: params.pdfDoc,
          cursor: params.cursor,
          fonts: params.fonts,
          headers: block.headers,
          rows: block.rows,
        });
        params.stats.renderedTableCount += 1;
        break;
      case "imagePlaceholder":
        await drawWrappedText({
          pdfDoc: params.pdfDoc,
          cursor: params.cursor,
          fonts: params.fonts,
          text: `[Image] ${block.caption}`,
          x: MARGIN,
          size: 10,
          lineHeight: 14,
        });
        params.cursor.y -= 4;
        break;
      default: {
        const _exhaustive: never = block;
        void _exhaustive;
        throw new Error("pdf_unknown_block");
      }
    }
  }
}

type PdfGenerateOptions = {
  companyName?: string | null;
  footerNote?: string | null;
  brandColorHex?: string | null;
  /** Optional keywords written into PDF metadata (P1-01 Production probe). */
  verificationKeywords?: string[] | null;
  pdf?: {
    brandColorHex?: string | null;
    footerNote?: string | null;
    marginPt?: number | null;
  } | null;
};

function hexToRgb(hex: string | null | undefined): ReturnType<typeof rgb> {
  const cleaned = (hex ?? "").replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return rgb(0.05, 0.18, 0.32);
  }
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * P1-01 fail-closed: source tables must be rendered.
 * Throws `pdf_tables_omitted` when source has tables but none were drawn.
 */
export function assertPdfTablesRendered(stats: PdfTableRenderStats): void {
  if (stats.sourceTableCount > 0 && stats.renderedTableCount === 0) {
    throw new Error("pdf_tables_omitted");
  }
  if (stats.renderedTableCount < stats.sourceTableCount) {
    throw new Error(
      `pdf_tables_partial:${stats.renderedTableCount}/${stats.sourceTableCount}`,
    );
  }
}

async function buildJapanesePdf(
  parsed: ParsedDeliverable,
  sourceText: string,
  options?: PdfGenerateOptions,
): Promise<{ buffer: Buffer; stats: PdfTableRenderStats }> {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = new Map();
  const cursor: DrawCursor = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };
  const titleColor = hexToRgb(
    options?.pdf?.brandColorHex ?? options?.brandColorHex,
  );
  const footerNote =
    options?.pdf?.footerNote ?? options?.footerNote ?? options?.companyName ?? null;

  const stats: PdfTableRenderStats = {
    sourceTableCount: countSourcePdfTables(parsed),
    renderedTableCount: 0,
  };

  const titleFont = await loadPdfFontForSubset(
    pdfDoc,
    fonts,
    subsetIndexForCodePoint(parsed.title.codePointAt(0) ?? 0),
  );

  for (const line of wrapText(parsed.title, titleFont, 20)) {
    ensureSpace(pdfDoc, cursor, 24);
    cursor.y -= 24;
    cursor.page.drawText(line, {
      x: MARGIN,
      y: cursor.y,
      size: 20,
      font: titleFont,
      color: titleColor,
    });
  }

  cursor.y -= 12;

  for (const section of parsed.sections) {
    const headingSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
    const headingFont = await loadPdfFontForSubset(
      pdfDoc,
      fonts,
      subsetIndexForCodePoint(section.title.codePointAt(0) ?? 0),
    );

    ensureSpace(pdfDoc, cursor, headingSize + 24);
    cursor.y -= headingSize + 8;
    cursor.page.drawText(section.title, {
      x: MARGIN,
      y: cursor.y,
      size: headingSize,
      font: headingFont,
      color: rgb(0.12, 0.31, 0.47),
    });
    cursor.y -= 8;

    await drawBlocks({
      pdfDoc,
      cursor,
      fonts,
      blocks: section.blocks,
      stats,
    });
  }

  if (parsed.sections.length === 0 && sourceText.trim()) {
    await drawWrappedText({
      pdfDoc,
      cursor,
      fonts,
      text: sourceText,
      x: MARGIN,
      size: 11,
      lineHeight: 16,
    });
  }

  assertPdfTablesRendered(stats);

  if (footerNote) {
    const footerFont = await loadPdfFontForSubset(
      pdfDoc,
      fonts,
      subsetIndexForCodePoint(footerNote.codePointAt(0) ?? 0),
    );
    cursor.page.drawText(footerNote.slice(0, 120), {
      x: MARGIN,
      y: 28,
      size: 9,
      font: footerFont,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  const keywords = (options?.verificationKeywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean);
  if (keywords.length > 0) {
    pdfDoc.setSubject(`p101:${keywords.join(",")}`);
    pdfDoc.setKeywords(keywords);
  }

  return {
    buffer: Buffer.from(await pdfDoc.save()),
    stats,
  };
}

/** PDF generator with embedded Japanese fonts (Noto Sans JP). */
export class PdfDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pdf" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: PdfGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const parsed = parseDeliverableContent(content);
    const { buffer } = await buildJapanesePdf(parsed, content, options);
    return createDeliverableFile("pdf", baseFileName, buffer, false);
  }
}

/** Test/helper: build PDF and return render stats (P1-01). */
export async function generatePdfWithTableStats(
  content: string,
  options?: PdfGenerateOptions,
): Promise<{ buffer: Buffer; stats: PdfTableRenderStats; parsed: ParsedDeliverable }> {
  const parsed = parseDeliverableContent(content);
  const { buffer, stats } = await buildJapanesePdf(parsed, content, options);
  return { buffer, stats, parsed };
}
