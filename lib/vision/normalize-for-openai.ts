import "server-only";

import sharp from "sharp";

import { detectImageMimeFromBytes } from "@/lib/vision/image-magic";
import { buildOpenAiDataUrlFromBuffer } from "@/lib/vision/validate-openai-image-payload";
import { VisionError } from "@/lib/vision/types";

export type VisionNormalizeProfile = "standard" | "compact" | "ocr";

export type NormalizedOpenAiImage = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  dataUrl: string;
  detectedInputMime: string | null;
  profile: VisionNormalizeProfile;
  byteLength: number;
  base64Length: number;
  urlLength: number;
  warnings: string[];
};

const PROFILE_SETTINGS: Record<
  VisionNormalizeProfile,
  { maxEdge: number; jpegQuality: number; maxBytes: number }
> = {
  // Long edge ~2048, readable for receipts/docs.
  standard: { maxEdge: 2048, jpegQuality: 85, maxBytes: 3_500_000 },
  // Fallback shrink when OpenAI rejects / times out.
  compact: { maxEdge: 1280, jpegQuality: 72, maxBytes: 1_500_000 },
  // Slightly higher quality for OCR-heavy work.
  ocr: { maxEdge: 2048, jpegQuality: 90, maxBytes: 4_000_000 },
};

const MIN_EDGE_PX = 32;
const MIN_BYTES = 64;

/**
 * Re-encode smartphone images into a safe OpenAI vision payload.
 * - HEIC/HEIF → JPEG when libvips supports it
 * - EXIF orientation applied (sharp.rotate())
 * - metadata stripped, sRGB normalized
 * - long-edge capped, magic bytes verified
 */
export async function normalizeImageForOpenAi(input: {
  buffer: Buffer;
  profile?: VisionNormalizeProfile;
  diagnosticId?: string | null;
}): Promise<NormalizedOpenAiImage> {
  const profile = input.profile ?? "standard";
  const settings = PROFILE_SETTINGS[profile];
  const warnings: string[] = [];
  const detectedInputMime = detectImageMimeFromBytes(input.buffer);

  if (!input.buffer?.length || input.buffer.length < MIN_BYTES) {
    throw new VisionError("empty_image", "解析用画像が空です", {
      diagnosticId: input.diagnosticId,
      failedStage: "preprocess",
    });
  }

  // Fresh sharp instance for metadata — never reuse a consumed pipeline.
  let meta;
  try {
    meta = await sharp(input.buffer, {
      failOn: "none",
      pages: 1,
    }).metadata();
  } catch (error) {
    if (detectedInputMime === "image/heic") {
      throw new VisionError(
        "unsupported_type",
        "このHEIC画像は変換できませんでした。JPEGまたはPNGで送り直してください",
        {
          diagnosticId: input.diagnosticId,
          failedStage: "preprocess",
          details: { detectedInputMime, profile },
          cause: error,
        },
      );
    }
    throw new VisionError(
      "corrupt_image",
      "画像が破損しているか、読み取れませんでした",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "preprocess",
        details: {
          safeMessage:
            error instanceof Error ? error.message.slice(0, 200) : "metadata_failed",
          detectedInputMime,
          profile,
          headHex32: input.buffer.subarray(0, 32).toString("hex"),
        },
        cause: error,
      },
    );
  }

  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;
  if (
    !originalWidth ||
    !originalHeight ||
    originalWidth < MIN_EDGE_PX ||
    originalHeight < MIN_EDGE_PX
  ) {
    throw new VisionError(
      "corrupt_image",
      "画像が小さすぎるか、寸法を取得できませんでした",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "preprocess",
        details: {
          originalWidth,
          originalHeight,
          detectedInputMime,
          profile,
        },
      },
    );
  }

  if (Math.max(originalWidth, originalHeight) > settings.maxEdge) {
    warnings.push(`resized_long_edge_to_${settings.maxEdge}`);
  }

  // Prefer JPEG for OpenAI (universal). Keep PNG only when alpha is required.
  // Fresh pipeline for encode (binary Buffer out — never utf8 string).
  const hasAlpha = Boolean(meta.hasAlpha);
  let buffer: Buffer;
  let mimeType: "image/jpeg" | "image/png";
  try {
    const base = sharp(input.buffer, { failOn: "none", pages: 1 })
      .rotate() // EXIF orientation
      .toColourspace("srgb")
      .resize({
        width: settings.maxEdge,
        height: settings.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });

    if (hasAlpha && profile !== "compact") {
      buffer = await base.png({ compressionLevel: 9, effort: 7 }).toBuffer();
      mimeType = "image/png";
    } else {
      const jpegPipeline = hasAlpha
        ? base.flatten({ background: "#ffffff" })
        : base;
      buffer = await jpegPipeline
        .jpeg({
          quality: settings.jpegQuality,
          mozjpeg: true,
          chromaSubsampling: "4:2:0",
        })
        .toBuffer();
      mimeType = "image/jpeg";
    }
  } catch (error) {
    throw new VisionError(
      "corrupt_image",
      "画像が大きすぎたため圧縮に失敗しました。別の画像でお試しください",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "preprocess",
        details: {
          safeMessage:
            error instanceof Error ? error.message.slice(0, 200) : "encode_failed",
          profile,
          detectedInputMime,
        },
        cause: error,
      },
    );
  }

  // If still oversized, force compact JPEG.
  if (buffer.length > settings.maxBytes) {
    warnings.push("reencoded_due_to_byte_limit");
    buffer = await sharp(buffer, { failOn: "none" })
      .resize({
        width: Math.min(settings.maxEdge, 1280),
        height: Math.min(settings.maxEdge, 1280),
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: Math.min(settings.jpegQuality, 70), mozjpeg: true })
      .toBuffer();
    mimeType = "image/jpeg";
  }

  const outMeta = await sharp(buffer).metadata();
  const width = outMeta.width ?? originalWidth;
  const height = outMeta.height ?? originalHeight;
  const detectedOut = detectImageMimeFromBytes(buffer);
  if (detectedOut !== mimeType) {
    throw new VisionError(
      "invalid_data_url",
      "画像のMIMEタイプと実データが一致しませんでした",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          declaredMime: mimeType,
          detectedMime: detectedOut,
          profile,
        },
      },
    );
  }

  // MIME from magic bytes of the encoded Buffer — never from extension/DB.
  const built = buildOpenAiDataUrlFromBuffer(buffer);
  if (built.mimeType !== mimeType) {
    throw new VisionError(
      "invalid_data_url",
      "画像のMIMEタイプと実データが一致しませんでした",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          declaredMime: mimeType,
          detectedMime: built.mimeType,
          headHex32: buffer.subarray(0, 32).toString("hex"),
        },
      },
    );
  }

  return {
    buffer,
    mimeType: built.mimeType,
    width,
    height,
    originalWidth,
    originalHeight,
    dataUrl: built.dataUrl,
    detectedInputMime,
    profile,
    byteLength: buffer.length,
    base64Length: buffer.toString("base64").length,
    urlLength: built.dataUrl.length,
    warnings,
  };
}

/** Map ATLAS detail to OpenAI detail — never send auto/original on gpt-5.5 path. */
export function resolveOpenAiVisionDetail(
  detail: "low" | "auto" | "high",
  attempt: number,
): "low" | "high" {
  if (attempt >= 3) return "low";
  if (detail === "low") return "low";
  // gpt-5.5: auto === original (expensive / flaky for phone photos). Always use high.
  return "high";
}

export function normalizeProfileForAttempt(
  attempt: number,
  preferReadableText: boolean,
): VisionNormalizeProfile {
  if (attempt <= 1) return preferReadableText ? "ocr" : "standard";
  if (attempt === 2) return "compact";
  return "compact";
}
