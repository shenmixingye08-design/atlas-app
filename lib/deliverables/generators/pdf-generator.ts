import { PDFDocument, rgb } from "pdf-lib";

import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock, ParsedDeliverable } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import {
  loadPdfFontForSubset,
  splitTextBySubset,
  subsetIndexForCodePoint,
} from "../fonts/japanese-pdf-fonts";
import { createDeliverableFile } from "./shared";

// Re-export for tests
export { subsetIndexForCodePoint } from "../fonts/japanese-pdf-fonts";

type PdfFonts = Map<number, Awaited<ReturnType<typeof loadPdfFontForSubset>>>;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function wrapText(text: string, font: Awaited<ReturnType<typeof loadPdfFontForSubset>>, size: number): string[] {
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

async function drawWrappedText(params: {
  page: ReturnType<PDFDocument["getPages"]>[number];
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  text: string;
  x: number;
  y: number;
  size: number;
  lineHeight: number;
}): Promise<number> {
  let cursorY = params.y;

  for (const paragraph of params.text.split("\n")) {
    if (!paragraph.trim()) {
      cursorY -= params.lineHeight;
      continue;
    }

    const runs = splitTextBySubset(paragraph);
    let line = "";
    let lineWidth = 0;

    const flushLine = async () => {
      if (!line) return;
      let drawX = params.x;
      for (const run of splitTextBySubset(line)) {
        const font = await loadPdfFontForSubset(
          params.pdfDoc,
          params.fonts,
          run.index,
        );
        params.page.drawText(run.text, {
          x: drawX,
          y: cursorY,
          size: params.size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        drawX += font.widthOfTextAtSize(run.text, params.size);
      }
      cursorY -= params.lineHeight;
      line = "";
      lineWidth = 0;
    };

    for (const run of runs) {
      for (const char of run.text) {
        const font = await loadPdfFontForSubset(params.pdfDoc, params.fonts, run.index);
        const candidate = line + char;
        const width = font.widthOfTextAtSize(candidate, params.size);
        if (width > CONTENT_WIDTH && line) {
          await flushLine();
          line = char;
          lineWidth = font.widthOfTextAtSize(char, params.size);
        } else {
          line = candidate;
          lineWidth = width;
        }
      }
    }

    await flushLine();
  }

  return cursorY;
}

async function drawBlocks(params: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["getPages"]>[number];
  fonts: PdfFonts;
  blocks: ContentBlock[];
  y: number;
}): Promise<number> {
  let cursorY = params.y;

  for (const block of params.blocks) {
    switch (block.type) {
      case "paragraph":
        cursorY = await drawWrappedText({
          page: params.page,
          pdfDoc: params.pdfDoc,
          fonts: params.fonts,
          text: block.text,
          x: MARGIN,
          y: cursorY,
          size: 11,
          lineHeight: 16,
        });
        cursorY -= 6;
        break;
      case "bulletList":
        for (const item of block.items) {
          cursorY = await drawWrappedText({
            page: params.page,
            pdfDoc: params.pdfDoc,
            fonts: params.fonts,
            text: `• ${item}`,
            x: MARGIN + 12,
            y: cursorY,
            size: 11,
            lineHeight: 16,
          });
        }
        cursorY -= 4;
        break;
      case "numberedList":
        for (let index = 0; index < block.items.length; index += 1) {
          cursorY = await drawWrappedText({
            page: params.page,
            pdfDoc: params.pdfDoc,
            fonts: params.fonts,
            text: `${index + 1}. ${block.items[index]}`,
            x: MARGIN + 12,
            y: cursorY,
            size: 11,
            lineHeight: 16,
          });
        }
        cursorY -= 4;
        break;
      default:
        break;
    }
  }

  return cursorY;
}

export async function buildPdfBufferFromParsed(
  parsed: ParsedDeliverable,
  sourceText: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = new Map();

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const titleFont = await loadPdfFontForSubset(pdfDoc, fonts, subsetIndexForCodePoint(
    parsed.title.codePointAt(0) ?? 0,
  ));

  for (const line of wrapText(parsed.title, titleFont, 20)) {
    y -= 24;
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 20,
      font: titleFont,
      color: rgb(0.05, 0.18, 0.32),
    });
  }

  y -= 12;

  for (const section of parsed.sections) {
    const headingSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
    const headingFont = await loadPdfFontForSubset(
      pdfDoc,
      fonts,
      subsetIndexForCodePoint(section.title.codePointAt(0) ?? 0),
    );

    if (y < MARGIN + 80) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    y -= headingSize + 8;
    page.drawText(section.title, {
      x: MARGIN,
      y,
      size: headingSize,
      font: headingFont,
      color: rgb(0.12, 0.31, 0.47),
    });
    y -= 8;

    y = await drawBlocks({
      pdfDoc,
      page,
      fonts,
      blocks: section.blocks,
      y,
    });
  }

  if (parsed.sections.length === 0 && sourceText.trim()) {
    y = await drawWrappedText({
      page,
      pdfDoc,
      fonts,
      text: sourceText,
      x: MARGIN,
      y,
      size: 11,
      lineHeight: 16,
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
  ): Promise<GeneratedDeliverableFile> {
    const parsed = parseDeliverableContent(content);
    const buffer = await buildPdfBufferFromParsed(parsed, content);
    return createDeliverableFile("pdf", baseFileName, buffer, false);
  }
}
