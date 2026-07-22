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

type PdfFonts = Map<number, Awaited<ReturnType<typeof loadPdfFontForSubset>>>;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const HEADER_Y = PAGE_HEIGHT - 28;
const FOOTER_Y = 28;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN - 12;
const CONTENT_BOTTOM = MARGIN + 24;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type DrawContext = {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  title: string;
  page: PDFPage;
  y: number;
  pageNumber: number;
};

async function ensureFont(
  pdfDoc: PDFDocument,
  fonts: PdfFonts,
  text: string,
): Promise<PDFFont> {
  return loadPdfFontForSubset(
    pdfDoc,
    fonts,
    subsetIndexForCodePoint(text.codePointAt(0) ?? 0),
  );
}

async function measureTextWidth(
  pdfDoc: PDFDocument,
  fonts: PdfFonts,
  text: string,
  size: number,
): Promise<number> {
  let width = 0;
  for (const run of splitTextBySubset(text)) {
    const font = await loadPdfFontForSubset(pdfDoc, fonts, run.index);
    width += font.widthOfTextAtSize(run.text, size);
  }
  return width;
}

async function drawTextRun(params: {
  page: PDFPage;
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  text: string;
  x: number;
  y: number;
  size: number;
  color?: ReturnType<typeof rgb>;
}): Promise<void> {
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
      color: params.color ?? rgb(0.1, 0.1, 0.1),
    });
    drawX += font.widthOfTextAtSize(run.text, params.size);
  }
}

async function drawHeaderFooter(ctx: DrawContext): Promise<void> {
  const muted = rgb(0.4, 0.45, 0.5);
  await drawTextRun({
    page: ctx.page,
    pdfDoc: ctx.pdfDoc,
    fonts: ctx.fonts,
    text: ctx.title,
    x: MARGIN,
    y: HEADER_Y,
    size: 8,
    color: muted,
  });

  ctx.page.drawLine({
    start: { x: MARGIN, y: HEADER_Y - 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: HEADER_Y - 8 },
    thickness: 0.5,
    color: rgb(0.82, 0.85, 0.9),
  });

  const footer = `${ctx.pageNumber}`;
  const footerWidth = await measureTextWidth(
    ctx.pdfDoc,
    ctx.fonts,
    footer,
    8,
  );
  await drawTextRun({
    page: ctx.page,
    pdfDoc: ctx.pdfDoc,
    fonts: ctx.fonts,
    text: footer,
    x: (PAGE_WIDTH - footerWidth) / 2,
    y: FOOTER_Y,
    size: 8,
    color: muted,
  });

  ctx.page.drawLine({
    start: { x: MARGIN, y: FOOTER_Y + 14 },
    end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_Y + 14 },
    thickness: 0.5,
    color: rgb(0.82, 0.85, 0.9),
  });
}

async function newPage(ctx: DrawContext): Promise<void> {
  ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;
  ctx.y = CONTENT_TOP;
  await drawHeaderFooter(ctx);
}

async function ensureSpace(ctx: DrawContext, needed: number): Promise<void> {
  if (ctx.y - needed < CONTENT_BOTTOM) {
    await newPage(ctx);
  }
}

async function drawWrappedText(params: {
  ctx: DrawContext;
  text: string;
  x: number;
  size: number;
  lineHeight: number;
  color?: ReturnType<typeof rgb>;
  maxWidth?: number;
}): Promise<void> {
  const maxWidth = params.maxWidth ?? CONTENT_WIDTH;
  const { ctx } = params;

  for (const paragraph of params.text.split("\n")) {
    if (!paragraph.trim()) {
      ctx.y -= params.lineHeight;
      continue;
    }

    let line = "";
    const flush = async () => {
      if (!line) return;
      await ensureSpace(ctx, params.lineHeight);
      await drawTextRun({
        page: ctx.page,
        pdfDoc: ctx.pdfDoc,
        fonts: ctx.fonts,
        text: line,
        x: params.x,
        y: ctx.y,
        size: params.size,
        color: params.color,
      });
      ctx.y -= params.lineHeight;
      line = "";
    };

    for (const run of splitTextBySubset(paragraph)) {
      for (const char of run.text) {
        const candidate = line + char;
        const width = await measureTextWidth(
          ctx.pdfDoc,
          ctx.fonts,
          candidate,
          params.size,
        );
        if (width > maxWidth && line) {
          await flush();
          line = char;
        } else {
          line = candidate;
        }
      }
    }
    await flush();
  }
}

async function drawTable(
  ctx: DrawContext,
  headers: string[],
  rows: string[][],
): Promise<void> {
  const columnCount = Math.max(headers.length, 1);
  const colWidth = CONTENT_WIDTH / columnCount;
  const rowHeight = 18;
  const headerHeight = 20;

  await ensureSpace(ctx, headerHeight + rowHeight);

  // Header background
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - headerHeight + 4,
    width: CONTENT_WIDTH,
    height: headerHeight,
    color: rgb(0.12, 0.31, 0.47),
  });

  for (let i = 0; i < columnCount; i += 1) {
    const text = (headers[i] ?? "").slice(0, 24);
    await drawTextRun({
      page: ctx.page,
      pdfDoc: ctx.pdfDoc,
      fonts: ctx.fonts,
      text,
      x: MARGIN + 4 + i * colWidth,
      y: ctx.y - 10,
      size: 9,
      color: rgb(1, 1, 1),
    });
  }
  ctx.y -= headerHeight + 2;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    await ensureSpace(ctx, rowHeight);
    if (rowIndex % 2 === 1) {
      ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - rowHeight + 4,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(0.97, 0.98, 0.99),
      });
    }

    ctx.page.drawRectangle({
      x: MARGIN,
      y: ctx.y - rowHeight + 4,
      width: CONTENT_WIDTH,
      height: rowHeight,
      borderColor: rgb(0.69, 0.72, 0.77),
      borderWidth: 0.4,
    });

    const row = rows[rowIndex] ?? [];
    for (let i = 0; i < columnCount; i += 1) {
      const text = (row[i] ?? "").slice(0, 28);
      await drawTextRun({
        page: ctx.page,
        pdfDoc: ctx.pdfDoc,
        fonts: ctx.fonts,
        text,
        x: MARGIN + 4 + i * colWidth,
        y: ctx.y - 10,
        size: 9,
      });
    }
    ctx.y -= rowHeight;
  }

  ctx.y -= 8;
}

async function drawBlocks(
  ctx: DrawContext,
  blocks: ContentBlock[],
): Promise<void> {
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        await drawWrappedText({
          ctx,
          text: block.text,
          x: MARGIN,
          size: 11,
          lineHeight: 16,
        });
        ctx.y -= 6;
        break;
      case "bulletList":
        for (const item of block.items) {
          await drawWrappedText({
            ctx,
            text: `• ${item}`,
            x: MARGIN + 12,
            size: 11,
            lineHeight: 16,
            maxWidth: CONTENT_WIDTH - 12,
          });
        }
        ctx.y -= 4;
        break;
      case "numberedList":
        for (let index = 0; index < block.items.length; index += 1) {
          await drawWrappedText({
            ctx,
            text: `${index + 1}. ${block.items[index]}`,
            x: MARGIN + 12,
            size: 11,
            lineHeight: 16,
            maxWidth: CONTENT_WIDTH - 12,
          });
        }
        ctx.y -= 4;
        break;
      case "table":
        await drawTable(ctx, block.headers, block.rows);
        break;
      case "imagePlaceholder":
        await ensureSpace(ctx, 70);
        ctx.page.drawRectangle({
          x: MARGIN,
          y: ctx.y - 60,
          width: CONTENT_WIDTH,
          height: 60,
          color: rgb(0.95, 0.95, 0.95),
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.8,
        });
        await drawTextRun({
          page: ctx.page,
          pdfDoc: ctx.pdfDoc,
          fonts: ctx.fonts,
          text: block.caption,
          x: MARGIN + 8,
          y: ctx.y - 34,
          size: 10,
          color: rgb(0.4, 0.4, 0.4),
        });
        ctx.y -= 72;
        break;
      default:
        break;
    }
  }
}

async function buildJapanesePdf(
  parsed: ParsedDeliverable,
  sourceText: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(parsed.title);
  pdfDoc.setAuthor("MINERVOT");
  pdfDoc.setProducer("MINERVOT Deliverables Engine");
  pdfDoc.setCreator("MINERVOT");

  const fonts: PdfFonts = new Map();
  // Warm default subset so Japanese + ASCII mix is searchable/copyable text.
  await ensureFont(pdfDoc, fonts, parsed.title || "あ");

  const ctx: DrawContext = {
    pdfDoc,
    fonts,
    title: parsed.title,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: CONTENT_TOP,
    pageNumber: 1,
  };
  await drawHeaderFooter(ctx);

  await drawWrappedText({
    ctx,
    text: parsed.title,
    x: MARGIN,
    size: 20,
    lineHeight: 26,
    color: rgb(0.05, 0.18, 0.32),
  });
  ctx.y -= 8;

  if (parsed.subtitle) {
    await drawWrappedText({
      ctx,
      text: parsed.subtitle,
      x: MARGIN,
      size: 12,
      lineHeight: 18,
      color: rgb(0.3, 0.3, 0.3),
    });
    ctx.y -= 6;
  }

  for (const section of parsed.sections) {
    const headingSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
    await ensureSpace(ctx, headingSize + 24);
    await drawWrappedText({
      ctx,
      text: section.title,
      x: MARGIN,
      size: headingSize,
      lineHeight: headingSize + 6,
      color: rgb(0.12, 0.31, 0.47),
    });
    ctx.y -= 4;
    await drawBlocks(ctx, section.blocks);
  }

  if (parsed.sections.length === 0 && sourceText.trim()) {
    await drawWrappedText({
      ctx,
      text: sourceText,
      x: MARGIN,
      size: 11,
      lineHeight: 16,
    });
  }

  // Second pass: rewrite footers with total page count awareness
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const label = `${i + 1} / ${pages.length}`;
    const width = await measureTextWidth(pdfDoc, fonts, label, 8);
    // Cover previous single-digit footer area with a small white rect then redraw
    page.drawRectangle({
      x: PAGE_WIDTH / 2 - 40,
      y: FOOTER_Y - 2,
      width: 80,
      height: 12,
      color: rgb(1, 1, 1),
    });
    await drawTextRun({
      page,
      pdfDoc,
      fonts,
      text: label,
      x: (PAGE_WIDTH - width) / 2,
      y: FOOTER_Y,
      size: 8,
      color: rgb(0.4, 0.45, 0.5),
    });
  }

  return Buffer.from(await pdfDoc.save());
}

/** PDF generator with embedded Japanese fonts (Noto Sans JP) — searchable text. */
export class PdfDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pdf" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    try {
      const parsed = parseDeliverableContent(content);
      const buffer = await buildJapanesePdf(parsed, content);
      if (buffer.byteLength < 64 || buffer.subarray(0, 4).toString("utf-8") !== "%PDF") {
        throw new Error("PDF生成結果が不正です（マジックヘッダなし）。");
      }
      return createDeliverableFile("pdf", baseFileName, buffer, false);
    } catch (error) {
      console.error("[PdfDeliverableGenerator] failed", error);
      throw error instanceof Error
        ? error
        : new Error("PDF生成に失敗しました");
    }
  }
}
