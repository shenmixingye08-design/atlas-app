import "server-only";

import {
  normalizeRasterImage,
  type RasterDiagnostic,
} from "@/lib/images/normalize-raster";
import type { VisionDetailLevel } from "@/lib/vision/types";

export type PreprocessResult = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  warnings: string[];
  diagnostic: RasterDiagnostic;
};

function maxEdgeForDetail(detail: VisionDetailLevel, preferReadableText: boolean): number {
  if (preferReadableText || detail === "high") return 2048;
  if (detail === "low") return 1024;
  return 1600;
}

/**
 * EXIF rotate, sRGB, resize, compress — keep text readable for receipts/tables.
 * Uses lazy `loadSharp` via normalizeRasterImage. Never eager-import sharp.
 */
export async function preprocessImageBuffer(input: {
  buffer: Buffer;
  detail?: VisionDetailLevel;
  preferReadableText?: boolean;
  diagnosticId?: string | null;
}): Promise<PreprocessResult> {
  const detail = input.detail ?? "auto";
  const preferReadableText = Boolean(input.preferReadableText);
  const maxEdge = maxEdgeForDetail(detail, preferReadableText);
  const normalized = await normalizeRasterImage({
    buffer: input.buffer,
    maxEdge,
    jpegQuality: preferReadableText ? 88 : 82,
    preferAlphaPng: true,
    diagnosticId: input.diagnosticId,
  });

  let buffer = normalized.buffer;
  let mimeType: PreprocessResult["mimeType"] = normalized.mimeType;
  let width = normalized.width;
  let height = normalized.height;
  const warnings = [...normalized.warnings];

  if (buffer.length > 4 * 1024 * 1024) {
    warnings.push("解析用画像が大きめです。送信前に再圧縮します");
    const compact = await normalizeRasterImage({
      buffer,
      maxEdge: 1600,
      jpegQuality: 75,
      preferAlphaPng: false,
      diagnosticId: normalized.diagnostic.diagnosticId,
    });
    buffer = compact.buffer;
    mimeType = compact.mimeType;
    width = compact.width;
    height = compact.height;
  }

  return {
    buffer,
    mimeType,
    width,
    height,
    originalWidth: normalized.originalWidth,
    originalHeight: normalized.originalHeight,
    warnings,
    diagnostic: normalized.diagnostic,
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
  return `data:${normalized};base64,${buffer.toString("base64")}`;
}
