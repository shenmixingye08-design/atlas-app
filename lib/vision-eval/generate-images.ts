import { createHash } from "crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

import sharp from "sharp";

import type { VisionEvalCase } from "@/lib/vision-eval/types";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgForCase(c: VisionEvalCase): string {
  const lines = c.seed.lines.map(escapeXml);
  const title = escapeXml(c.seed.title);
  const textNodes = lines
    .map(
      (line, idx) =>
        `<text x="48" y="${110 + idx * 36}" font-family="DejaVu Sans, Noto Sans CJK JP, sans-serif" font-size="22" fill="#111">${line}</text>`
    )
    .join("\n");

  // Unique visual marker so images are not byte-identical clones.
  const marker = escapeXml(c.caseId);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="960" height="640" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f4f1ea"/>
  <rect x="32" y="32" width="896" height="576" rx="10" fill="#ffffff" stroke="#222" stroke-width="2"/>
  <text x="48" y="78" font-family="DejaVu Sans, Noto Sans CJK JP, sans-serif" font-size="30" font-weight="700" fill="#111">${title}</text>
  ${textNodes}
  <text x="48" y="600" font-family="DejaVu Sans, monospace" font-size="14" fill="#666">${marker}</text>
</svg>`;
}

async function renderBasePng(c: VisionEvalCase): Promise<Buffer> {
  return sharp(Buffer.from(svgForCase(c))).png().toBuffer();
}

async function applyCategoryEffects(
  c: VisionEvalCase,
  png: Buffer
): Promise<Buffer> {
  let img = sharp(png);
  if (c.category === "dark") {
    img = img.modulate({ brightness: 0.35, saturation: 0.8 });
  } else if (c.category === "tilted") {
    img = img.rotate(12, { background: "#f4f1ea" });
  } else if (c.category === "blurred") {
    img = img.blur(2.2);
  } else if (c.category === "handwritten_note") {
    // Slight noise via lower quality re-encode + mild rotate
    img = img.rotate(1, { background: "#f4f1ea" });
  }
  return img.png().toBuffer();
}

export type GeneratedImage = {
  caseId: string;
  absolutePath: string;
  byteLength: number;
  sha256: string;
};

/**
 * Generate unique PNGs for each case under outDir.
 * Does not clone the same bytes across cases.
 */
export async function generateVisionEvalImages(
  cases: VisionEvalCase[],
  outDir: string
): Promise<GeneratedImage[]> {
  mkdirSync(join(outDir, "images"), { recursive: true });
  const generated: GeneratedImage[] = [];
  const hashes = new Set<string>();

  for (const c of cases) {
    const base = await renderBasePng(c);
    const buf = await applyCategoryEffects(c, base);
    const sha256 = createHash("sha256").update(buf).digest("hex");
    if (hashes.has(sha256)) {
      throw new Error(`duplicate image bytes for ${c.caseId}`);
    }
    hashes.add(sha256);
    const absolutePath = join(outDir, c.imagePath);
    mkdirSync(join(absolutePath, ".."), { recursive: true });
    writeFileSync(absolutePath, buf);
    generated.push({
      caseId: c.caseId,
      absolutePath,
      byteLength: buf.length,
      sha256,
    });
  }
  return generated;
}

export function readCaseImage(
  c: VisionEvalCase,
  outDir: string
): Buffer {
  const path = join(outDir, c.imagePath);
  if (!existsSync(path)) {
    throw new Error(`missing image for ${c.caseId}: ${path}`);
  }
  return readFileSync(path);
}
