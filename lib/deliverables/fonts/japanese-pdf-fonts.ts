import { readFileSync } from "fs";
import { join } from "path";

import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

const FONT_DIR = join(process.cwd(), "node_modules/@fontsource/noto-sans-jp/files");
const UNICODE_MAP_PATH = join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-jp/unicode.json",
);

type SubsetRange = {
  index: number;
  start: number;
  end: number;
};

function parseCodePoint(token: string): number {
  return Number.parseInt(token.replace(/^U\+/i, ""), 16);
}

function buildSubsetRanges(): SubsetRange[] {
  const raw = JSON.parse(readFileSync(UNICODE_MAP_PATH, "utf8")) as Record<string, string>;
  const ranges: SubsetRange[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const index = Number.parseInt(key.replace(/[[\]]/g, ""), 10);
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes("-")) {
        const [startToken, endToken] = trimmed.split("-");
        ranges.push({
          index,
          start: parseCodePoint(startToken),
          end: parseCodePoint(endToken),
        });
      } else {
        const codePoint = parseCodePoint(trimmed);
        ranges.push({ index, start: codePoint, end: codePoint });
      }
    }
  }

  return ranges;
}

const SUBSET_RANGES = buildSubsetRanges();

export function subsetIndexForCodePoint(codePoint: number): number | null {
  for (const range of SUBSET_RANGES) {
    if (codePoint >= range.start && codePoint <= range.end) {
      return range.index;
    }
  }
  return null;
}

function subsetFontPath(index: number): string {
  return join(FONT_DIR, `noto-sans-jp-${index}-400-normal.woff2`);
}

export type JapanesePdfFontSet = {
  defaultFont: PDFFont;
  fontForText(text: string): PDFFont;
};

/** Embed Noto Sans JP subsets needed for the given text. */
export async function embedJapanesePdfFonts(
  pdfDoc: PDFDocument,
  sampleText: string,
): Promise<JapanesePdfFontSet> {
  pdfDoc.registerFontkit(fontkit);

  const cache = new Map<number, PDFFont>();
  const neededIndexes = new Set<number>();

  for (const char of sampleText) {
    const index = subsetIndexForCodePoint(char.codePointAt(0) ?? 0);
    if (index !== null) neededIndexes.add(index);
  }

  if (neededIndexes.size === 0) {
    neededIndexes.add(0);
  }

  for (const index of neededIndexes) {
    const bytes = readFileSync(subsetFontPath(index));
    const font = await pdfDoc.embedFont(bytes, { subset: true });
    cache.set(index, font);
  }

  const defaultFont = cache.values().next().value as PDFFont;

  return {
    defaultFont,
    fontForText(text: string) {
      for (const char of text) {
        const index = subsetIndexForCodePoint(char.codePointAt(0) ?? 0);
        if (index !== null && cache.has(index)) {
          return cache.get(index)!;
        }
      }
      return defaultFont;
    },
  };
}

export function splitTextBySubset(text: string): Array<{ text: string; index: number | null }> {
  if (!text) return [];

  const runs: Array<{ text: string; index: number | null }> = [];
  let currentIndex = subsetIndexForCodePoint(text.codePointAt(0) ?? 0);
  let currentText = "";

  for (const char of text) {
    const index = subsetIndexForCodePoint(char.codePointAt(0) ?? 0);
    if (index !== currentIndex && currentText) {
      runs.push({ text: currentText, index: currentIndex });
      currentText = char;
      currentIndex = index;
    } else {
      currentText += char;
      currentIndex = index;
    }
  }

  if (currentText) {
    runs.push({ text: currentText, index: currentIndex });
  }

  return runs;
}

export async function loadPdfFontForSubset(
  pdfDoc: PDFDocument,
  cache: Map<number, PDFFont>,
  index: number | null,
): Promise<PDFFont> {
  const resolvedIndex = index ?? 0;
  const cached = cache.get(resolvedIndex);
  if (cached) return cached;

  pdfDoc.registerFontkit(fontkit);
  const bytes = readFileSync(subsetFontPath(resolvedIndex));
  const font = await pdfDoc.embedFont(bytes, { subset: true });
  cache.set(resolvedIndex, font);
  return font;
}
