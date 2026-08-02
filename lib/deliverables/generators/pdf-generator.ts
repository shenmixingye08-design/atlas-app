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

type DrawCursor = {
  page: PDFPage;
  y: number;
};

function wrapText(text: string, font: PDFFont, size: number): string[] {
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
      if (width > CONTENT_WIDTH && line) {
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

async function drawBlocks(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  blocks: ContentBlock[];
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
      default:
        break;
    }
  }
}

type PdfGenerateOptions = {
  companyName?: string | null;
  footerNote?: string | null;
  brandColorHex?: string | null;
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

async function buildJapanesePdf(
  parsed: ParsedDeliverable,
  sourceText: string,
  options?: PdfGenerateOptions,
): Promise<Buffer> {
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
