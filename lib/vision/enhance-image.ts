import "server-only";

import sharp from "sharp";

export type ImageEnhanceOptions = {
  /** Apply light deskew when angle estimate is confident. */
  deskew?: boolean;
  /** Median denoise (text docs / receipts). */
  denoise?: boolean;
  /** Contrast normalize + mild sharpen. */
  contrast?: boolean;
  /** Max absolute deskew degrees to apply. */
  maxDeskewDegrees?: number;
};

export type ImageEnhanceResult = {
  buffer: Buffer;
  applied: string[];
  skewDegrees: number | null;
};

/**
 * Estimate small skew (−max..+max) via horizontal projection variance.
 * Returns 0 when confidence is low.
 */
export async function estimateSkewDegrees(
  buffer: Buffer,
  maxDegrees = 8,
): Promise<number> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .greyscale()
    .normalize()
    .resize({ width: 320, height: 320, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  if (width < 32 || height < 32) return 0;

  let bestAngle = 0;
  let bestScore = -Infinity;

  // 2° steps keep phone-doc deskew useful without burning CPU on every upload.
  for (let angle = -maxDegrees; angle <= maxDegrees; angle += 2) {
    const rotated =
      angle === 0
        ? { data, info }
        : await sharp(buffer, { failOn: "none" })
            .greyscale()
            .normalize()
            .rotate(angle, { background: "#ffffff" })
            .resize({ width: 320, height: 320, fit: "inside" })
            .raw()
            .toBuffer({ resolveWithObject: true });

    const w = rotated.info.width;
    const h = rotated.info.height;
    const rowSums = new Float64Array(h);
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        sum += 255 - (rotated.data[row + x] ?? 0);
      }
      rowSums[y] = sum;
    }
    const mean = rowSums.reduce((a, b) => a + b, 0) / h;
    let variance = 0;
    for (let y = 0; y < h; y += 1) {
      const d = rowSums[y]! - mean;
      variance += d * d;
    }
    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = angle;
    }
  }

  // Ignore tiny angles (noise).
  return Math.abs(bestAngle) >= 1 ? bestAngle : 0;
}

/**
 * Enterprise preprocess enhancements beyond EXIF rotate / resize:
 * deskew, denoise, contrast. Safe defaults for Vision OCR quality.
 */
export async function enhanceImageForVision(
  buffer: Buffer,
  options: ImageEnhanceOptions = {},
): Promise<ImageEnhanceResult> {
  const deskew = options.deskew !== false;
  const denoise = options.denoise !== false;
  const contrast = options.contrast !== false;
  const maxDeskew = options.maxDeskewDegrees ?? 8;
  const applied: string[] = [];
  let skewDegrees: number | null = null;
  let pipeline = sharp(buffer, { failOn: "none", pages: 1 }).rotate();

  if (deskew) {
    try {
      skewDegrees = await estimateSkewDegrees(buffer, maxDeskew);
      if (skewDegrees !== 0) {
        pipeline = sharp(buffer, { failOn: "none", pages: 1 })
          .rotate()
          .rotate(skewDegrees, { background: "#ffffff" });
        applied.push(`deskew_${skewDegrees}deg`);
      }
    } catch {
      pipeline = sharp(buffer, { failOn: "none", pages: 1 }).rotate();
    }
  }

  pipeline = pipeline.toColourspace("srgb");

  if (denoise) {
    pipeline = pipeline.median(3);
    applied.push("denoise_median3");
  }

  if (contrast) {
    pipeline = pipeline.normalize().sharpen({ sigma: 0.7, m1: 0.5, m2: 0.3 });
    applied.push("contrast_normalize_sharpen");
  }

  const out = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  if (applied.length === 0) applied.push("exif_rotate_srgb");
  return { buffer: out, applied, skewDegrees };
}
