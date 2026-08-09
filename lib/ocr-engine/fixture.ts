/**
 * Ground-truth OCR fixture for P2-05 evaluation.
 * Image is generated at runtime (sharp) so deploy artifacts never miss it.
 * Tokens are ASCII-safe so serverless fonts can render glyphs reliably.
 */

import sharp from "sharp";

/** Distinctive tokens that must appear in OCR extract for accuracy gate. */
export const OCR_GROUND_TRUTH_TOKENS = [
  "ATLAS-OCR-7842",
  "MINERVOT",
  "TOTAL",
  "1280",
] as const;

export async function buildOcrGroundTruthImage(): Promise<{
  bytes: Buffer;
  mimeType: "image/png";
  tokens: readonly string[];
}> {
  const lines = [
    "MINERVOT OCR EVAL",
    "ATLAS-OCR-7842",
    "ITEM: OFFICE SUPPLY",
    "TOTAL 1280",
  ];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="36" y="80" font-size="40" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111111">${lines[0]}</text>
  <text x="36" y="150" font-size="44" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111111">${lines[1]}</text>
  <text x="36" y="220" font-size="36" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111111">${lines[2]}</text>
  <text x="36" y="290" font-size="44" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111111">${lines[3]}</text>
</svg>`;
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    bytes,
    mimeType: "image/png",
    tokens: OCR_GROUND_TRUTH_TOKENS,
  };
}
