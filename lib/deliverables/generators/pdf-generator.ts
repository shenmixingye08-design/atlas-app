import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock, ParsedDeliverable } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import {
  loadPdfFontForSubset,
  splitTextBySubset,
  subsetIndexForCodePoint,
} from "../fonts/japanese-pdf-fonts";
import {
  canBreakAfter,
  normalizeJapaneseBusinessText,
} from "../pdf-production/japanese-normalize";
import { assertPdfProductionOrThrow } from "../pdf-production/pdf-inspect";
import { createDeliverableFile } from "./shared";

export { subsetIndexForCodePoint } from "../fonts/japanese-pdf-fonts";

type PdfFonts = Map<number, PDFFont>;

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 52;
const HEADER_Y_OFFSET = 22;
const FOOTER_Y = 28;

type DrawCursor = {
  page: PDFPage;
  y: number;
  width: number;
  height: number;
  landscape: boolean;
};

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

async function wrapTextMixed(params: {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  text: string;
  size: number;
  maxWidth: number;
}): Promise<string[]> {
  const lines: string[] = [];
  for (const paragraph of params.text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const char of paragraph) {
      const candidate = line + char;
      const width = await measureWidth(
        params.pdfDoc,
        params.fonts,
        candidate,
        params.size,
      );
      if (width > params.maxWidth && line) {
        if (!canBreakAfter(line.slice(-1), char) && line.length > 1) {
          const move = line.slice(-1);
          lines.push(line.slice(0, -1));
          line = move + char;
        } else {
          lines.push(line);
          line = char;
        }
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function newPage(
  pdfDoc: PDFDocument,
  landscape: boolean,
): DrawCursor {
  const size = landscape ? A4_LANDSCAPE : A4_PORTRAIT;
  const page = pdfDoc.addPage(size);
  return {
    page,
    y: size[1] - MARGIN_TOP,
    width: size[0],
    height: size[1],
    landscape,
  };
}

function contentWidth(cursor: DrawCursor): number {
  return cursor.width - MARGIN_X * 2;
}

function ensureSpace(
  pdfDoc: PDFDocument,
  cursor: DrawCursor,
  needed: number,
  landscape?: boolean,
): void {
  if (cursor.y - needed < MARGIN_BOTTOM) {
    const useLandscape = landscape ?? cursor.landscape;
    const next = newPage(pdfDoc, useLandscape);
    cursor.page = next.page;
    cursor.y = next.y;
    cursor.width = next.width;
    cursor.height = next.height;
    cursor.landscape = next.landscape;
  }
}

async function drawTextLine(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  text: string;
  x: number;
  size: number;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center" | "right";
}): Promise<void> {
  if (!params.text) return;
  let drawX = params.x;
  if (params.align && params.align !== "left") {
    const width = await measureWidth(
      params.pdfDoc,
      params.fonts,
      params.text,
      params.size,
    );
    if (params.align === "center") {
      drawX = params.x + (contentWidth(params.cursor) - width) / 2;
    } else if (params.align === "right") {
      drawX = params.x + contentWidth(params.cursor) - width;
    }
  }
  for (const run of splitTextBySubset(params.text)) {
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
      color: params.color ?? rgb(0.1, 0.1, 0.1),
    });
    drawX += font.widthOfTextAtSize(run.text, params.size);
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
  maxWidth?: number;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center" | "right";
}): Promise<void> {
  const maxWidth = params.maxWidth ?? contentWidth(params.cursor) - (params.x - MARGIN_X);
  const normalized = normalizeJapaneseBusinessText(params.text);
  const lines = await wrapTextMixed({
    pdfDoc: params.pdfDoc,
    fonts: params.fonts,
    text: normalized,
    size: params.size,
    maxWidth: Math.max(40, maxWidth),
  });

  for (const line of lines) {
    if (!line.trim()) {
      ensureSpace(params.pdfDoc, params.cursor, params.lineHeight * 0.6);
      params.cursor.y -= params.lineHeight * 0.6;
      continue;
    }
    ensureSpace(params.pdfDoc, params.cursor, params.lineHeight);
    await drawTextLine({
      pdfDoc: params.pdfDoc,
      cursor: params.cursor,
      fonts: params.fonts,
      text: line,
      x: params.x,
      size: params.size,
      color: params.color,
      align: params.align,
    });
    params.cursor.y -= params.lineHeight;
  }
}

async function drawTable(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  headers: string[];
  rows: string[][];
}): Promise<void> {
  const colCount = Math.max(
    params.headers.length,
    ...params.rows.map((r) => r.length),
    1,
  );
  const landscape = colCount >= 7;
  if (landscape && !params.cursor.landscape) {
    const next = newPage(params.pdfDoc, true);
    params.cursor.page = next.page;
    params.cursor.y = next.y;
    params.cursor.width = next.width;
    params.cursor.height = next.height;
    params.cursor.landscape = true;
  }

  const width = contentWidth(params.cursor);
  const colWidth = width / colCount;
  const fontSize = colCount >= 7 ? 8 : 9;
  const lineHeight = fontSize + 3;
  const pad = 4;

  const headers = [...params.headers];
  while (headers.length < colCount) headers.push("");

  const wrapCell = async (text: string): Promise<string[]> =>
    wrapTextMixed({
      pdfDoc: params.pdfDoc,
      fonts: params.fonts,
      text: normalizeJapaneseBusinessText(text),
      size: fontSize,
      maxWidth: Math.max(20, colWidth - pad * 2),
    });

  const drawRow = async (
    cells: string[],
    opts: { header?: boolean },
  ): Promise<void> => {
    const wrapped = await Promise.all(
      Array.from({ length: colCount }, (_, i) => wrapCell(cells[i] ?? "")),
    );
    const rowHeight =
      Math.max(1, ...wrapped.map((lines) => lines.length)) * lineHeight + pad * 2;

    ensureSpace(params.pdfDoc, params.cursor, rowHeight, landscape);
    // Header repeat after page break: caller re-invokes header when needed
    const top = params.cursor.y;
    const bottom = top - rowHeight;

    for (let c = 0; c < colCount; c += 1) {
      const x = MARGIN_X + c * colWidth;
      params.cursor.page.drawRectangle({
        x,
        y: bottom,
        width: colWidth,
        height: rowHeight,
        borderWidth: 0.6,
        borderColor: rgb(0.55, 0.55, 0.55),
        color: opts.header ? rgb(0.91, 0.93, 0.97) : rgb(1, 1, 1),
      });
      let textY = top - pad - fontSize;
      for (const line of wrapped[c] ?? []) {
        let drawX = x + pad;
        for (const run of splitTextBySubset(line)) {
          const font = await loadPdfFontForSubset(
            params.pdfDoc,
            params.fonts,
            run.index,
          );
          params.cursor.page.drawText(run.text, {
            x: drawX,
            y: textY,
            size: fontSize,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
          drawX += font.widthOfTextAtSize(run.text, fontSize);
        }
        textY -= lineHeight;
      }
    }
    params.cursor.y = bottom;
  };

  const pageBeforeHeader = () => params.cursor.page;
  await drawRow(headers, { header: true });
  let headerPage = pageBeforeHeader();

  for (const row of params.rows) {
    const cells = [...row];
    while (cells.length < colCount) cells.push("");
    const pageBefore = params.cursor.page;
    // Estimate height; if new page will be needed, ensureSpace inside drawRow
    // After draw, if page changed, re-draw header on new page before row — handled by pre-check:
    const wrapped = await Promise.all(
      cells.map((c) => wrapCell(c)),
    );
    const rowHeight =
      Math.max(1, ...wrapped.map((lines) => lines.length)) * lineHeight + pad * 2;
    if (params.cursor.y - rowHeight < MARGIN_BOTTOM) {
      ensureSpace(params.pdfDoc, params.cursor, rowHeight, landscape);
      if (params.cursor.page !== headerPage) {
        await drawRow(headers, { header: true });
        headerPage = params.cursor.page;
      }
    }
    void pageBefore;
    await drawRow(cells, { header: false });
    headerPage = params.cursor.page;
  }

  params.cursor.y -= 8;
  // Subsequent page breaks return to portrait for body content.
  if (landscape) {
    params.cursor.landscape = false;
  }
}

async function drawImageBlock(params: {
  pdfDoc: PDFDocument;
  cursor: DrawCursor;
  fonts: PdfFonts;
  caption: string;
  dataUrl?: string;
}): Promise<void> {
  const maxW = Math.min(contentWidth(params.cursor), 420);
  const maxH = 260;
  let image: PDFImage | null = null;
  let drawW = maxW;
  let drawH = 120;

  if (params.dataUrl?.startsWith("data:image/")) {
    const match = params.dataUrl.match(
      /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i,
    );
    if (match) {
      try {
        const bytes = Buffer.from(match[2]!, "base64");
        const isPng = /png/i.test(match[1]!);
        image = isPng
          ? await params.pdfDoc.embedPng(bytes)
          : await params.pdfDoc.embedJpg(bytes);
        const iw = image.width;
        const ih = image.height;
        const scale = Math.min(maxW / iw, maxH / ih, 1);
        drawW = iw * scale;
        drawH = ih * scale;
      } catch {
        image = null;
      }
    }
  }

  const captionHeight = 28;
  const blockH = (image ? drawH : 80) + captionHeight + 12;
  ensureSpace(params.pdfDoc, params.cursor, blockH);

  if (image) {
    const x = MARGIN_X + (contentWidth(params.cursor) - drawW) / 2;
    params.cursor.y -= drawH;
    params.cursor.page.drawImage(image, {
      x,
      y: params.cursor.y,
      width: drawW,
      height: drawH,
    });
  } else {
    params.cursor.y -= 80;
    params.cursor.page.drawRectangle({
      x: MARGIN_X,
      y: params.cursor.y,
      width: contentWidth(params.cursor),
      height: 80,
      borderWidth: 0.8,
      borderColor: rgb(0.7, 0.7, 0.7),
      color: rgb(0.96, 0.96, 0.96),
    });
    await drawTextLine({
      pdfDoc: params.pdfDoc,
      cursor: {
        ...params.cursor,
        y: params.cursor.y + 34,
      },
      fonts: params.fonts,
      text: "[ 画像 ]",
      x: MARGIN_X,
      size: 11,
      color: rgb(0.45, 0.45, 0.45),
      align: "center",
    });
  }

  params.cursor.y -= 14;
  await drawWrappedText({
    pdfDoc: params.pdfDoc,
    cursor: params.cursor,
    fonts: params.fonts,
    text: params.caption || "画像",
    x: MARGIN_X,
    size: 9,
    lineHeight: 12,
    color: rgb(0.35, 0.35, 0.35),
    align: "center",
  });
  params.cursor.y -= 8;
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
          x: MARGIN_X,
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
            x: MARGIN_X + 12,
            size: 11,
            lineHeight: 16,
            maxWidth: contentWidth(params.cursor) - 12,
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
            x: MARGIN_X + 12,
            size: 11,
            lineHeight: 16,
            maxWidth: contentWidth(params.cursor) - 12,
          });
        }
        params.cursor.y -= 4;
        break;
      case "table":
        await drawTable({
          pdfDoc: params.pdfDoc,
          cursor: params.cursor,
          fonts: params.fonts,
          headers: block.headers,
          rows: block.rows,
        });
        break;
      case "imagePlaceholder":
        await drawImageBlock({
          pdfDoc: params.pdfDoc,
          cursor: params.cursor,
          fonts: params.fonts,
          caption: block.caption,
          dataUrl: block.dataUrl,
        });
        break;
      default:
        break;
    }
  }
}

async function applyHeaderFooter(
  pdfDoc: PDFDocument,
  fonts: PdfFonts,
  title: string,
): Promise<void> {
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const header = normalizeJapaneseBusinessText(title).slice(0, 40);

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const { width, height } = page.getSize();
    const cursor: DrawCursor = {
      page,
      y: height - HEADER_Y_OFFSET,
      width,
      height,
      landscape: width > height,
    };
    await drawTextLine({
      pdfDoc,
      cursor,
      fonts,
      text: header,
      x: MARGIN_X,
      size: 8,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawLine({
      start: { x: MARGIN_X, y: height - MARGIN_TOP + 10 },
      end: { x: width - MARGIN_X, y: height - MARGIN_TOP + 10 },
      thickness: 0.4,
      color: rgb(0.75, 0.75, 0.75),
    });

    cursor.y = FOOTER_Y;
    const footer = `${i + 1} / ${total}`;
    await drawTextLine({
      pdfDoc,
      cursor,
      fonts,
      text: footer,
      x: MARGIN_X,
      size: 9,
      color: rgb(0.35, 0.35, 0.35),
      align: "center",
    });
    page.drawLine({
      start: { x: MARGIN_X, y: MARGIN_BOTTOM - 10 },
      end: { x: width - MARGIN_X, y: MARGIN_BOTTOM - 10 },
      thickness: 0.4,
      color: rgb(0.75, 0.75, 0.75),
    });
  }
}

async function buildJapanesePdf(
  parsed: ParsedDeliverable,
  sourceText: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = new Map();
  const cursor = newPage(pdfDoc, false);

  const title = normalizeJapaneseBusinessText(
    parsed.title || "MINERVOT成果物",
  );

  pdfDoc.setTitle(title);
  pdfDoc.setAuthor("MINERVOT");
  pdfDoc.setCreator("MINERVOT");
  pdfDoc.setProducer("MINERVOT PDF Engine");
  pdfDoc.setSubject("business-document");
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());
  pdfDoc.setKeywords(["MINERVOT", "PDF", "日本語"]);

  await drawWrappedText({
    pdfDoc,
    cursor,
    fonts,
    text: title,
    x: MARGIN_X,
    size: 20,
    lineHeight: 26,
    color: rgb(0.05, 0.18, 0.32),
  });
  cursor.y -= 10;

  if (parsed.subtitle) {
    await drawWrappedText({
      pdfDoc,
      cursor,
      fonts,
      text: parsed.subtitle,
      x: MARGIN_X,
      size: 12,
      lineHeight: 16,
      color: rgb(0.25, 0.25, 0.25),
    });
    cursor.y -= 8;
  }

  for (const section of parsed.sections) {
    const headingSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
    ensureSpace(pdfDoc, cursor, headingSize + 20);
    cursor.y -= 4;
    await drawWrappedText({
      pdfDoc,
      cursor,
      fonts,
      text: normalizeJapaneseBusinessText(section.title),
      x: MARGIN_X,
      size: headingSize,
      lineHeight: headingSize + 6,
      color: rgb(0.12, 0.31, 0.47),
    });
    cursor.y -= 4;

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
      x: MARGIN_X,
      size: 11,
      lineHeight: 16,
    });
  }

  await applyHeaderFooter(pdfDoc, fonts, title);

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

/** PDF generator with embedded Japanese fonts (Noto Sans JP). */
export class PdfDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pdf" as const;

  async generate(
    content: string,
    baseFileName: string,
    _options?: Record<string, unknown>,
  ): Promise<GeneratedDeliverableFile> {
    void _options;
    const parsed = parseDeliverableContent(content);
    const buffer = await buildJapanesePdf(parsed, content);
    await assertPdfProductionOrThrow(buffer);
    return createDeliverableFile("pdf", baseFileName, buffer, false);
  }
}
