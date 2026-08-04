import "server-only";

import sharp from "sharp";

import type { VisionDetailLevel } from "@/lib/vision/types";

export type PreprocessResult = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  warnings: string[];
};

function maxEdgeForDetail(detail: VisionDetailLevel, preferReadableText: boolean): number {
  if (preferReadableText || detail === "high") return 2048;
  if (detail === "low") return 1024;
  return 1600;
}

/**
 * EXIF rotate, resize, compress — keep text readable for receipts/tables.
 * Upload-time normalization; OpenAI send path re-normalizes again via
 * `normalizeImageForOpenAi` (sRGB / magic-byte verify / profiles).
 */
export async function preprocessImageBuffer(input: {
  buffer: Buffer;
  detail?: VisionDetailLevel;
  preferReadableText?: boolean;
}): Promise<PreprocessResult> {
  const warnings: string[] = [];
  const detail = input.detail ?? "auto";
  const preferReadableText = Boolean(input.preferReadableText);

  // Fresh instance for metadata — never reuse a sharp pipeline after await.
  const meta = await sharp(input.buffer, {
    failOn: "none",
    pages: 1,
  }).metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;

  if (!originalWidth || !originalHeight) {
    throw new Error("画像を読み取れませんでした（破損の可能性があります）");
  }

  const maxEdge = maxEdgeForDetail(detail, preferReadableText);
  // Prefer JPEG for photos; keep PNG when alpha likely matters.
  const hasAlpha = Boolean(meta.hasAlpha);
  let buffer: Buffer;
  let mimeType: PreprocessResult["mimeType"];

  // Fresh encode pipeline (EXIF rotate + sRGB + resize).
  const encode = sharp(input.buffer, { failOn: "none", pages: 1 })
    .rotate()
    .toColourspace("srgb")
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (hasAlpha) {
    buffer = await encode.png({ compressionLevel: 8 }).toBuffer();
    mimeType = "image/png";
  } else if (preferReadableText) {
    buffer = await encode.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    mimeType = "image/jpeg";
  } else {
    buffer = await encode.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    mimeType = "image/jpeg";
  }

  // Cap upload-processed size so Storage stays lean (OpenAI path re-encodes).
  if (buffer.length > 4 * 1024 * 1024) {
    warnings.push("解析用画像が大きめです。送信前に再圧縮します");
    buffer = await sharp(buffer, { failOn: "none" })
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer();
    mimeType = "image/jpeg";
  }

  const outMeta = await sharp(buffer).metadata();

  return {
    buffer,
    mimeType,
    width: outMeta.width ?? originalWidth,
    height: outMeta.height ?? originalHeight,
    originalWidth,
    originalHeight,
    warnings,
  };
}

/**
 * Build a data URL from a Buffer via binary Base64 (`buffer.toString("base64")`).
 * Never pass a UTF-8 string as image bytes.
 *
 * For OpenAI vision payloads, prefer `buildOpenAiDataUrlFromBuffer` /
 * `validateOpenAiImageDataUrl` so MIME comes from magic bytes, not callers.
 */
export function toDataUrl(mimeType: string, buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("toDataUrl requires a Buffer (binary), not a string");
  }
  const normalized =
    mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType.toLowerCase();
  // Binary → base64 only. Do NOT use buffer.toString("utf8").
  return `data:${normalized};base64,${buffer.toString("base64")}`;
}
