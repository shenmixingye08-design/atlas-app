import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  buildStructuredDocument,
  getDocumentTheme,
  type DesignTemplateId,
  type DocumentBlock,
  type DocumentTheme,
  type StructuredDocument,
} from "../document-model";
import {
  loadPdfFontForSubset,
  splitTextBySubset,
} from "../fonts/japanese-pdf-fonts";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

export { subsetIndexForCodePoint } from "../fonts/japanese-pdf-fonts";

type PdfFonts = Map<number, PDFFont>;

export type PdfGenerateOptions = {
  assignment?: string;
  title?: string;
  designTemplate?: DesignTemplateId;
  authorLabel?: string;
};

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

type PageContext = {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  theme: DocumentTheme;
  doc: StructuredDocument;
  page: PDFPage;
  width: number;
  height: number;
  margin: DocumentTheme["marginPt"];
  y: number;
  landscape: boolean;
};

function accentColor(theme: DocumentTheme) {
  return rgb(theme.accentRgb.r, theme.accentRgb.g, theme.accentRgb.b);
}

function textColor() {
  return rgb(0.13, 0.13, 0.13);
}

function mutedColor() {
  return rgb(0.4, 0.4, 0.4);
}

async function measureWidth(
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

async function wrapLine(
  pdfDoc: PDFDocument,
  fonts: PdfFonts,
  text: string,
  size: number,
  maxWidth: number,
): Promise<string[]> {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const char of paragraph) {
      const candidate = current + char;
      const width = await measureWidth(pdfDoc, fonts, candidate, size);
      if (width > maxWidth && current) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function drawTextLine(params: {
  ctx: PageContext;
  text: string;
  x: number;
  y: number;
  size: number;
  color?: ReturnType<typeof rgb>;
}): Promise<void> {
  let drawX = params.x;
  for (const run of splitTextBySubset(params.text)) {
    const font = await loadPdfFontForSubset(
      params.ctx.pdfDoc,
      params.ctx.fonts,
      run.index,
    );
    params.ctx.page.drawText(run.text, {
      x: drawX,
      y: params.y,
      size: params.size,
      font,
      color: params.color ?? textColor(),
    });
    drawX += font.widthOfTextAtSize(run.text, params.size);
  }
}

async function ensureSpace(ctx: PageContext, needed: number): Promise<void> {
  const bottom = ctx.margin.bottom + 28;
  if (ctx.y - needed >= bottom) return;
  ctx.page = await addContentPage(ctx);
  ctx.y = ctx.height - ctx.margin.top - 36;
}

async function addContentPage(ctx: PageContext): Promise<PDFPage> {
  const size = ctx.landscape ? A4_LANDSCAPE : A4_PORTRAIT;
  const page = ctx.pdfDoc.addPage([size.width, size.height]);
  ctx.width = size.width;
  ctx.height = size.height;
  await drawHeaderFooter(ctx, page);
  return page;
}

async function drawHeaderFooter(ctx: PageContext, page: PDFPage): Promise<void> {
  const header = `${ctx.doc.title} ｜ ${ctx.doc.meta.documentTypeLabel}`;
  const headerSize = 8;
  await drawTextLine({
    ctx: { ...ctx, page },
    text: header.slice(0, 60),
    x: ctx.margin.left,
    y: ctx.height - ctx.margin.top + 18,
    size: headerSize,
    color: mutedColor(),
  });
  page.drawLine({
    start: { x: ctx.margin.left, y: ctx.height - ctx.margin.top + 10 },
    end: { x: ctx.width - ctx.margin.right, y: ctx.height - ctx.margin.top + 10 },
    thickness: 0.6,
    color: rgb(0.82, 0.84, 0.87),
  });

  page.drawLine({
    start: { x: ctx.margin.left, y: ctx.margin.bottom - 10 },
    end: { x: ctx.width - ctx.margin.right, y: ctx.margin.bottom - 10 },
    thickness: 0.6,
    color: rgb(0.82, 0.84, 0.87),
  });
}

async function drawWrapped(params: {
  ctx: PageContext;
  text: string;
  size: number;
  lineHeight: number;
  x?: number;
  maxWidth?: number;
  color?: ReturnType<typeof rgb>;
}): Promise<void> {
  const x = params.x ?? params.ctx.margin.left;
  const maxWidth =
    params.maxWidth ??
    params.ctx.width - params.ctx.margin.left - params.ctx.margin.right;
  const lines = await wrapLine(
    params.ctx.pdfDoc,
    params.ctx.fonts,
    params.text,
    params.size,
    maxWidth,
  );

  for (const line of lines) {
    await ensureSpace(params.ctx, params.lineHeight);
    if (line) {
      await drawTextLine({
        ctx: params.ctx,
        text: line,
        x,
        y: params.ctx.y,
        size: params.size,
        color: params.color,
      });
    }
    params.ctx.y -= params.lineHeight;
  }
}

async function drawCallout(
  ctx: PageContext,
  variant: "note" | "important" | "warning",
  text: string,
): Promise<void> {
  const label =
    variant === "important" ? "重要" : variant === "warning" ? "注意" : "注記";
  const contentWidth = ctx.width - ctx.margin.left - ctx.margin.right;
  const lines = await wrapLine(
    ctx.pdfDoc,
    ctx.fonts,
    `【${label}】 ${text}`,
    10,
    contentWidth - 16,
  );
  const boxHeight = lines.length * 14 + 16;
  await ensureSpace(ctx, boxHeight + 8);
  ctx.page.drawRectangle({
    x: ctx.margin.left,
    y: ctx.y - boxHeight + 4,
    width: contentWidth,
    height: boxHeight,
    color: rgb(0.95, 0.96, 0.98),
    borderColor: accentColor(ctx.theme),
    borderWidth: 1,
  });
  ctx.page.drawRectangle({
    x: ctx.margin.left,
    y: ctx.y - boxHeight + 4,
    width: 3,
    height: boxHeight,
    color: accentColor(ctx.theme),
  });
  let textY = ctx.y - 12;
  for (const line of lines) {
    await drawTextLine({
      ctx,
      text: line,
      x: ctx.margin.left + 10,
      y: textY,
      size: 10,
    });
    textY -= 14;
  }
  ctx.y -= boxHeight + 10;
}

async function drawKeyCard(
  ctx: PageContext,
  title: string,
  items: string[],
): Promise<void> {
  await drawWrapped({
    ctx,
    text: title,
    size: 11,
    lineHeight: 16,
    color: accentColor(ctx.theme),
  });
  for (const item of items) {
    const contentWidth = ctx.width - ctx.margin.left - ctx.margin.right;
    const lines = await wrapLine(
      ctx.pdfDoc,
      ctx.fonts,
      `・${item}`,
      10,
      contentWidth - 14,
    );
    const height = lines.length * 14 + 10;
    await ensureSpace(ctx, height + 6);
    ctx.page.drawRectangle({
      x: ctx.margin.left,
      y: ctx.y - height + 2,
      width: contentWidth,
      height,
      color: rgb(0.95, 0.97, 0.99),
      borderColor: rgb(0.82, 0.86, 0.9),
      borderWidth: 0.8,
    });
    let textY = ctx.y - 12;
    for (const line of lines) {
      await drawTextLine({
        ctx,
        text: line,
        x: ctx.margin.left + 8,
        y: textY,
        size: 10,
      });
      textY -= 14;
    }
    ctx.y -= height + 6;
  }
  ctx.y -= 4;
}

function estimateColWidths(
  headers: string[],
  rows: string[][],
  totalWidth: number,
): number[] {
  const colCount = Math.max(headers.length, 1);
  const weights = Array.from({ length: colCount }, (_, index) => {
    let max = headers[index]?.length ?? 1;
    for (const row of rows) {
      max = Math.max(max, row[index]?.length ?? 1);
    }
    return Math.max(max, 4);
  });
  const sum = weights.reduce((acc, value) => acc + value, 0) || colCount;
  return weights.map((weight) => (weight / sum) * totalWidth);
}

async function drawTable(
  ctx: PageContext,
  headers: string[],
  rows: string[][],
): Promise<void> {
  const contentWidth = ctx.width - ctx.margin.left - ctx.margin.right;
  const colWidths = estimateColWidths(headers, rows, contentWidth);
  const fontSize = 9;
  const lineHeight = 12;

  const drawRow = async (
    cells: string[],
    header: boolean,
  ): Promise<void> => {
    const wrappedCells: string[][] = [];
    let rowHeight = lineHeight + 10;
    for (let i = 0; i < colWidths.length; i += 1) {
      const cellText = (cells[i] ?? "").trim() || "—";
      const lines = await wrapLine(
        ctx.pdfDoc,
        ctx.fonts,
        cellText,
        fontSize,
        Math.max(colWidths[i]! - 10, 20),
      );
      wrappedCells.push(lines);
      rowHeight = Math.max(rowHeight, lines.length * lineHeight + 10);
    }

    await ensureSpace(ctx, rowHeight + 2);
    let x = ctx.margin.left;
    for (let i = 0; i < colWidths.length; i += 1) {
      const width = colWidths[i]!;
      ctx.page.drawRectangle({
        x,
        y: ctx.y - rowHeight + 2,
        width,
        height: rowHeight,
        color: header
          ? accentColor(ctx.theme)
          : rgb(1, 1, 1),
        borderColor: rgb(0.78, 0.82, 0.86),
        borderWidth: 0.7,
      });
      let textY = ctx.y - 12;
      for (const line of wrappedCells[i] ?? []) {
        await drawTextLine({
          ctx,
          text: line,
          x: x + 5,
          y: textY,
          size: fontSize,
          color: header ? rgb(1, 1, 1) : textColor(),
        });
        textY -= lineHeight;
      }
      x += width;
    }
    ctx.y -= rowHeight;
  };

  // Keep header with at least one body row when possible.
  await ensureSpace(ctx, 48);
  await drawRow(headers, true);
  for (const row of rows) {
    await drawRow(row, false);
  }
  ctx.y -= 10;
}

async function drawBlocks(ctx: PageContext, blocks: DocumentBlock[]): Promise<void> {
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        await drawWrapped({
          ctx,
          text: block.text,
          size: 11,
          lineHeight: 16,
        });
        ctx.y -= 6;
        break;
      case "bulletList":
        for (const item of block.items) {
          await drawWrapped({
            ctx,
            text: `• ${item}`,
            size: 11,
            lineHeight: 16,
            x: ctx.margin.left + 8,
            maxWidth:
              ctx.width - ctx.margin.left - ctx.margin.right - 8,
          });
        }
        ctx.y -= 4;
        break;
      case "numberedList":
        for (let index = 0; index < block.items.length; index += 1) {
          await drawWrapped({
            ctx,
            text: `${index + 1}. ${block.items[index]}`,
            size: 11,
            lineHeight: 16,
            x: ctx.margin.left + 8,
            maxWidth:
              ctx.width - ctx.margin.left - ctx.margin.right - 8,
          });
        }
        ctx.y -= 4;
        break;
      case "table":
        await drawTable(ctx, block.headers, block.rows);
        break;
      case "callout":
        await drawCallout(ctx, block.variant, block.text);
        break;
      case "keyCard":
        await drawKeyCard(ctx, block.title, block.items);
        break;
      case "imagePlaceholder":
        await drawWrapped({
          ctx,
          text: `[${block.caption}]`,
          size: 10,
          lineHeight: 14,
          color: mutedColor(),
        });
        break;
    }
  }
}

async function drawCover(ctx: PageContext): Promise<void> {
  const page = ctx.pdfDoc.addPage([A4_PORTRAIT.width, A4_PORTRAIT.height]);
  ctx.page = page;
  ctx.width = A4_PORTRAIT.width;
  ctx.height = A4_PORTRAIT.height;
  ctx.y = ctx.height - 180;

  page.drawRectangle({
    x: 0,
    y: ctx.height - 8,
    width: ctx.width,
    height: 8,
    color: accentColor(ctx.theme),
  });

  await drawWrapped({
    ctx,
    text: ctx.doc.meta.documentTypeLabel,
    size: 12,
    lineHeight: 18,
    color: accentColor(ctx.theme),
  });
  ctx.y -= 10;

  await drawWrapped({
    ctx,
    text: ctx.doc.title,
    size: 24,
    lineHeight: 32,
    color: accentColor(ctx.theme),
  });

  page.drawLine({
    start: { x: ctx.margin.left, y: ctx.y + 8 },
    end: { x: ctx.margin.left + 160, y: ctx.y + 8 },
    thickness: 2,
    color: accentColor(ctx.theme),
  });
  ctx.y -= 24;

  if (ctx.doc.subtitle) {
    await drawWrapped({
      ctx,
      text: ctx.doc.subtitle,
      size: 12,
      lineHeight: 18,
      color: mutedColor(),
    });
    ctx.y -= 20;
  }

  ctx.y = Math.min(ctx.y, 220);
  await drawWrapped({
    ctx,
    text: `作成日：${ctx.doc.meta.createdAtLabel}`,
    size: 11,
    lineHeight: 16,
    color: mutedColor(),
  });
  await drawWrapped({
    ctx,
    text: `作成：${ctx.doc.meta.authorLabel}`,
    size: 11,
    lineHeight: 16,
    color: mutedColor(),
  });
  for (const field of ctx.doc.meta.fields) {
    await drawWrapped({
      ctx,
      text: `${field.label}：${field.value}`,
      size: 11,
      lineHeight: 16,
      color: mutedColor(),
    });
  }
}

async function stampPageNumbers(ctx: PageContext): Promise<void> {
  const pages = ctx.pdfDoc.getPages();
  const size = 9;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    const { width } = page.getSize();
    const label = `MINERVOT  —  ${index + 1} / ${pages.length}`;
    const textWidth = await measureWidth(ctx.pdfDoc, ctx.fonts, label, size);
    let drawX = (width - textWidth) / 2;
    const y = 28;
    for (const run of splitTextBySubset(label)) {
      const font = await loadPdfFontForSubset(ctx.pdfDoc, ctx.fonts, run.index);
      page.drawText(run.text, {
        x: drawX,
        y,
        size,
        font,
        color: mutedColor(),
      });
      drawX += font.widthOfTextAtSize(run.text, size);
    }
  }
}

async function buildJapanesePdf(doc: StructuredDocument): Promise<Buffer> {
  const theme = getDocumentTheme(doc.designTemplate);
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = new Map();
  const landscape = doc.preferLandscapeTables;

  const ctx: PageContext = {
    pdfDoc,
    fonts,
    theme,
    doc,
    page: pdfDoc.addPage([A4_PORTRAIT.width, A4_PORTRAIT.height]),
    width: A4_PORTRAIT.width,
    height: A4_PORTRAIT.height,
    margin: theme.marginPt,
    y: A4_PORTRAIT.height - theme.marginPt.top,
    landscape,
  };

  // Replace the placeholder first page with a proper cover.
  pdfDoc.removePage(0);
  await drawCover(ctx);

  ctx.page = await addContentPage(ctx);
  ctx.y = ctx.height - ctx.margin.top - 36;

  for (const section of doc.sections) {
    const headingSize = section.level === 1 ? 16 : section.level === 2 ? 13 : 12;
    // Prevent orphan headings: require room for heading + a few body lines.
    await ensureSpace(ctx, headingSize + 48);
    if (section.pageBreakBefore) {
      ctx.page = await addContentPage(ctx);
      ctx.y = ctx.height - ctx.margin.top - 36;
    }

    await drawWrapped({
      ctx,
      text: section.title,
      size: headingSize,
      lineHeight: headingSize + 6,
      color: accentColor(ctx.theme),
    });
    ctx.page.drawLine({
      start: { x: ctx.margin.left, y: ctx.y + 2 },
      end: {
        x: ctx.margin.left + (section.level === 1 ? 120 : 72),
        y: ctx.y + 2,
      },
      thickness: section.level === 1 ? 1.2 : 0.8,
      color: accentColor(ctx.theme),
    });
    ctx.y -= 10;
    await drawBlocks(ctx, section.blocks);
    ctx.y -= 8;
  }

  await stampPageNumbers(ctx);
  return Buffer.from(await pdfDoc.save());
}

/** PDF generator with document-type templates and Japanese fonts. */
export class PdfDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pdf" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: PdfGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const structured = buildStructuredDocument({
      content,
      assignment: options?.assignment,
      title: options?.title,
      designTemplate: options?.designTemplate,
      authorLabel: options?.authorLabel,
    });
    const buffer = await buildJapanesePdf(structured);
    return createDeliverableFile("pdf", baseFileName, buffer, false);
  }
}
