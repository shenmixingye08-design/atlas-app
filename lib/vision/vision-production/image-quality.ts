import "server-only";

import sharp from "sharp";

export type ImageQualityAssessment = {
  tooDark: boolean;
  tooBright: boolean;
  likelyBlurry: boolean;
  small: boolean;
  skewHintDeg: number;
  meanLuma: number;
  warnings: string[];
};

/**
 * Assess smartphone / scan image quality without AI.
 */
export async function assessImageQuality(
  buffer: Buffer,
): Promise<ImageQualityAssessment> {
  const warnings: string[] = [];
  const meta = await sharp(buffer, { failOn: "none", pages: 1 }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const small = width > 0 && height > 0 && Math.max(width, height) < 640;
  if (small) warnings.push("image_small");

  const { data, info } = await sharp(buffer, { failOn: "none", pages: 1 })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let edge = 0;
  const channels = info.channels;
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
  }
  const meanLuma = pixels > 0 ? sum / pixels : 128;

  // Cheap blur proxy: average absolute difference vs 1px-right neighbor on a downsample.
  const sample = await sharp(buffer, { failOn: "none", pages: 1 })
    .rotate()
    .greyscale()
    .resize(64, 64, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let diff = 0;
  let pairs = 0;
  for (let y = 0; y < sample.info.height; y += 1) {
    for (let x = 0; x < sample.info.width - 1; x += 1) {
      const a = sample.data[y * sample.info.width + x] ?? 0;
      const b = sample.data[y * sample.info.width + x + 1] ?? 0;
      diff += Math.abs(a - b);
      pairs += 1;
    }
  }
  const avgEdge = pairs > 0 ? diff / pairs : 0;
  edge = avgEdge;
  const likelyBlurry = avgEdge < 4.5;
  if (likelyBlurry) warnings.push("image_blurry");

  const tooDark = meanLuma < 55;
  const tooBright = meanLuma > 230;
  if (tooDark) warnings.push("image_dark");
  if (tooBright) warnings.push("image_bright");

  // Skew hint unused for auto-deskew angle (safe 0) — EXIF rotate handles orientation.
  void edge;
  return {
    tooDark,
    tooBright,
    likelyBlurry,
    small,
    skewHintDeg: 0,
    meanLuma,
    warnings,
  };
}

/**
 * Enhance dark / soft images for OCR (non-AI). Applies EXIF rotate + mild normalize.
 */
export async function enhanceImageForOcr(buffer: Buffer): Promise<{
  buffer: Buffer;
  warnings: string[];
}> {
  const assessment = await assessImageQuality(buffer);
  const warnings = [...assessment.warnings];
  let pipeline = sharp(buffer, { failOn: "none", pages: 1 }).rotate().toColourspace("srgb");

  if (assessment.tooDark) {
    pipeline = pipeline.modulate({ brightness: 1.25 }).normalize();
    warnings.push("enhanced_brightness");
  } else if (assessment.tooBright) {
    pipeline = pipeline.modulate({ brightness: 0.92 });
    warnings.push("reduced_brightness");
  } else {
    pipeline = pipeline.normalize();
  }

  if (assessment.likelyBlurry) {
    pipeline = pipeline.sharpen({ sigma: 1.1 });
    warnings.push("sharpened");
  }

  const out = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { buffer: out, warnings };
}
