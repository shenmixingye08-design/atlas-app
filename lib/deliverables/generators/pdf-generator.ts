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
const DEFAULT_MARGIN = 50;

export type PdfGenerateOptions = {
  marginsMm?: number;
  headerFooter?: boolean;
  pageLayout?: "compact" | "standard" | "spacious";
  fontFamily?: string;
};

function marginFromOptions(options?: PdfGenerateOptions): number {
  if (options?.marginsMm != null && Number.isFinite(options.marginsMm)) {
    // mm → PDF points (~2.834)
    return Math.max(24, Math.min(90, Math.round(options.marginsMm * 2.834)));
  }
  if (options?.pageLayout === "compact") return 36;
  if (options?.pageLayout === "spacious") return 64;
  return DEFAULT_MARGIN;
}

type DrawCursor = {
  page: PDFPage;
  y: number;
};

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  contentWidth: number,
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
      if (width > contentWidth && line) {
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
  margin: number,
): void {
  if (cursor.y - needed < margin) {
    cursor.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - margin;
  }
}

async function drawWrappedText(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  text: string;
  x: number;
  size: number;
  lineHeight: number;
  margin: number;
  contentWidth: number;
}): Promise<void> {
  for (const paragraph of params.text.split("\n")) {
    if (!paragraph.trim()) {
      ensureSpace(
        params.pdfDoc,
        params.cursor,
        params.lineHeight,
        params.margin,
      );
      params.cursor.y -= params.lineHeight * 0.6;
      continue;
    }

    const runs = splitTextBySubset(paragraph);
    let line = "";

    const flushLine = async () => {
      if (!line) return;
      ensureSpace(
        params.pdfDoc,
        params.cursor,
        params.lineHeight,
        params.margin,
      );
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
        if (width > params.contentWidth && line) {
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

async function drawBlocks(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  blocks: ContentBlock[];
  margin: number;
  contentWidth: number;
}): Promise<void> {
  for (const block of params.blocks) {
    switch (block.type) {
      case "paragraph":
        await drawWrappedText({
          pdfDoc: params.pdfDoc,
          cursor: params.cursor,
          fonts: params.fonts,
          text: block.text,
          x: params.margin,
          size: 11,
          lineHeight: 16,
          margin: params.margin,
          contentWidth: params.contentWidth,
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
            x: params.margin + 12,
            size: 11,
            lineHeight: 16,
            margin: params.margin,
            contentWidth: params.contentWidth,
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
            x: params.margin + 12,
            size: 11,
            lineHeight: 16,
            margin: params.margin,
            contentWidth: params.contentWidth,
          });
        }
        params.cursor.y -= 4;
        break;
      default:
        break;
    }
  }
}

async function buildJapanesePdf(
  parsed: ParsedDeliverable,
  sourceText: string,
  options?: PdfGenerateOptions,
): Promise<Buffer> {
  const margin = marginFromOptions(options);
  const contentWidth = PAGE_WIDTH - margin * 2;
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = new Map();
  const cursor: DrawCursor = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - margin,
  };

  const titleFont = await loadPdfFontForSubset(
    pdfDoc,
    fonts,
    subsetIndexForCodePoint(parsed.title.codePointAt(0) ?? 0),
  );

  for (const line of wrapText(parsed.title, titleFont, 20, contentWidth)) {
    ensureSpace(pdfDoc, cursor, 24, margin);
    cursor.y -= 24;
    cursor.page.drawText(line, {
      x: margin,
      y: cursor.y,
      size: 20,
      font: titleFont,
      color: rgb(0.05, 0.18, 0.32),
    });
  }

  cursor.y -= 12;

  if (options?.headerFooter !== false) {
    cursor.page.drawText("MINERVOT", {
      x: margin,
      y: PAGE_HEIGHT - margin + 8,
      size: 8,
      font: titleFont,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  for (const section of parsed.sections) {
    const headingSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
    const headingFont = await loadPdfFontForSubset(
      pdfDoc,
      fonts,
      subsetIndexForCodePoint(section.title.codePointAt(0) ?? 0),
    );

    ensureSpace(pdfDoc, cursor, headingSize + 24, margin);
    cursor.y -= headingSize + 8;
    cursor.page.drawText(section.title, {
      x: margin,
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
      margin,
      contentWidth,
    });
  }

  if (parsed.sections.length === 0 && sourceText.trim()) {
    await drawWrappedText({
      pdfDoc,
      cursor,
      fonts,
      text: sourceText,
      x: margin,
      size: 11,
      lineHeight: 16,
      margin,
      contentWidth,
    });
  }

  if (options?.headerFooter !== false) {
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i += 1) {
      pages[i]!.drawText(`${i + 1} / ${pages.length}`, {
        x: PAGE_WIDTH - margin - 40,
        y: margin - 16,
        size: 8,
        font: titleFont,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
  }

  void options?.fontFamily;
  return Buffer.from(await pdfDoc.save());
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
    const buffer = await buildJapanesePdf(parsed, content, options);
    return createDeliverableFile("pdf", baseFileName, buffer, false);
  }
}
