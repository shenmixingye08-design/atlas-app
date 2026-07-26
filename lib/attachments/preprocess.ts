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
 */
export async function preprocessImageBuffer(input: {
  buffer: Buffer;
  detail?: VisionDetailLevel;
  preferReadableText?: boolean;
}): Promise<PreprocessResult> {
  const warnings: string[] = [];
  const detail = input.detail ?? "auto";
  const preferReadableText = Boolean(input.preferReadableText);

  let pipeline = sharp(input.buffer, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;

  if (!originalWidth || !originalHeight) {
    throw new Error("画像を読み取れませんでした（破損の可能性があります）");
  }

  const maxEdge = maxEdgeForDetail(detail, preferReadableText);
  const longest = Math.max(originalWidth, originalHeight);
  if (longest > maxEdge) {
    pipeline = pipeline.resize({
      width: originalWidth >= originalHeight ? maxEdge : undefined,
      height: originalHeight > originalWidth ? maxEdge : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Prefer JPEG for photos; keep PNG when alpha likely matters.
  const hasAlpha = Boolean(meta.hasAlpha);
  let buffer: Buffer;
  let mimeType: PreprocessResult["mimeType"];

  if (hasAlpha) {
    buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    mimeType = "image/png";
  } else if (preferReadableText) {
    buffer = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    mimeType = "image/jpeg";
  } else {
    buffer = await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    mimeType = "image/jpeg";
  }

  const outMeta = await sharp(buffer).metadata();
  if (buffer.length > 4 * 1024 * 1024) {
    warnings.push("解析用画像が大きめです。詳細解析には時間がかかる場合があります");
  }

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

export function toDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
