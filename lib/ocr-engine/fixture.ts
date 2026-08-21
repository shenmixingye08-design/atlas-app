/**
 * Ground-truth OCR fixture for P2-05 evaluation.
 * Prefer committed PNG (fonts baked in). Fallback: render with bundled TTF.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loadSharp } from "@/lib/images/load-sharp";

/** Distinctive tokens that must appear in OCR extract for accuracy gate. */
export const OCR_GROUND_TRUTH_TOKENS = [
  "ATLAS-OCR-7842",
  "MINERVOT",
  "TOTAL",
  "1280",
] as const;

function committedPngPath(): string {
  return join(process.cwd(), "testdata/ocr/ground-truth.png");
}

function bundledFontPath(): string {
  return join(process.cwd(), "testdata/ocr/fonts/DejaVuSans.ttf");
}

async function renderWithBundledFont(): Promise<Buffer> {
  const fontPath = bundledFontPath();
  const fontFace = existsSync(fontPath)
    ? `@font-face { font-family: 'ProbeFont'; src: url('file://${fontPath}'); }`
    : "";
  const family = existsSync(fontPath)
    ? "ProbeFont, DejaVu Sans, sans-serif"
    : "DejaVu Sans, Liberation Sans, Arial, sans-serif";
  const lines = [
    "MINERVOT OCR EVAL",
    "ATLAS-OCR-7842",
    "ITEM: OFFICE SUPPLY",
    "TOTAL 1280",
  ];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="480">
  <defs><style>${fontFace}</style></defs>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="48" y="100" font-size="48" font-family="${family}" fill="#000000">${lines[0]}</text>
  <text x="48" y="190" font-size="56" font-family="${family}" fill="#000000">${lines[1]}</text>
  <text x="48" y="280" font-size="44" font-family="${family}" fill="#000000">${lines[2]}</text>
  <text x="48" y="370" font-size="56" font-family="${family}" fill="#000000">${lines[3]}</text>
</svg>`;
  const sharp = await loadSharp();
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function buildOcrGroundTruthImage(): Promise<{
  bytes: Buffer;
  mimeType: "image/png";
  tokens: readonly string[];
}> {
  const committed = committedPngPath();
  if (existsSync(committed)) {
    return {
      bytes: readFileSync(committed),
      mimeType: "image/png",
      tokens: OCR_GROUND_TRUTH_TOKENS,
    };
  }
  return {
    bytes: await renderWithBundledFont(),
    mimeType: "image/png",
    tokens: OCR_GROUND_TRUTH_TOKENS,
  };
}
