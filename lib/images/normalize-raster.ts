import "server-only";

import { randomUUID } from "crypto";

import { loadSharp } from "@/lib/images/load-sharp";
import { detectImageMimeFromBytes } from "@/lib/security/file-magic";

export const RASTER_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export type RasterMime = (typeof RASTER_ALLOWLIST)[number];

export type RasterDeveloperCode =
  | "ok"
  | "image_corrupt"
  | "image_empty"
  | "image_too_large_pixels"
  | "image_unsupported"
  | "preprocess_encode_failed"
  | "preprocess_failed";

export type RasterFallbackName =
  | "primary_srgb_mozjpeg"
  | "srgb_jpeg"
  | "plain_jpeg"
  | "flatten_jpeg"
  | "decoded_reencode"
  | "png_alpha";

export type RasterDiagnostic = {
  diagnosticId: string;
  failedStage: "preprocess";
  developerCode: RasterDeveloperCode;
  detectedMime: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  width: number | null;
  height: number | null;
  space: string | null;
  isProgressive: boolean | null;
  orientation: number | null;
  hasAlpha: boolean | null;
  hasProfile: boolean | null;
  byteLength: number;
  headHex32: string;
  usedFallback: RasterFallbackName | null;
  sharpError: string | null;
  decodeOk: boolean;
};

export type NormalizedRaster = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  warnings: string[];
  diagnostic: RasterDiagnostic;
};

export class RasterNormalizeError extends Error {
  readonly diagnostic: RasterDiagnostic;
  readonly developerCode: RasterDeveloperCode;

  constructor(message: string, diagnostic: RasterDiagnostic) {
    super(message);
    this.name = "RasterNormalizeError";
    this.diagnostic = diagnostic;
    this.developerCode = diagnostic.developerCode;
  }
}

const MIN_BYTES = 64;
const MIN_EDGE_PX = 1;
const MAX_EDGE_PX = 20_000;
const MAX_INPUT_PIXELS = 50_000_000;

function sanitizeSharpMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "sharp_failed";
  return raw.replace(/\s+/g, " ").slice(0, 240);
}

function isAllowlistedMime(mime: string | null): mime is RasterMime {
  return Boolean(mime && (RASTER_ALLOWLIST as readonly string[]).includes(mime));
}

function newDiagnosticId(): string {
  return `idiag_${Date.now().toString(36)}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function baseDiagnostic(buffer: Buffer, detectedMime: string | null): RasterDiagnostic {
  return {
    diagnosticId: newDiagnosticId(),
    failedStage: "preprocess",
    developerCode: "preprocess_failed",
    detectedMime,
    originalWidth: null,
    originalHeight: null,
    width: null,
    height: null,
    space: null,
    isProgressive: null,
    orientation: null,
    hasAlpha: null,
    hasProfile: null,
    byteLength: buffer.length,
    headHex32: buffer.subarray(0, 32).toString("hex"),
    usedFallback: null,
    sharpError: null,
    decodeOk: false,
  };
}

/**
 * Decode + normalize JPEG/PNG/WEBP (and HEIC when libvips can) for Vision.
 * Magic bytes win over declared MIME. Metadata failure is not fatal if
 * the raster can still be decoded. Encode uses a fallback ladder so a
 * missing mozjpeg / ICC / colorspace path cannot reject a readable photo.
 */
export async function normalizeRasterImage(input: {
  buffer: Buffer;
  maxEdge: number;
  jpegQuality?: number;
  preferAlphaPng?: boolean;
  diagnosticId?: string | null;
}): Promise<NormalizedRaster> {
  const warnings: string[] = [];
  const detectedMime = detectImageMimeFromBytes(input.buffer);
  const diagnostic = baseDiagnostic(input.buffer, detectedMime);
  if (input.diagnosticId?.trim()) {
    diagnostic.diagnosticId = input.diagnosticId.trim();
  }

  if (!input.buffer?.length || input.buffer.length < MIN_BYTES) {
    diagnostic.developerCode = "image_empty";
    throw new RasterNormalizeError("解析用画像が空です", diagnostic);
  }

  if (!isAllowlistedMime(detectedMime)) {
    diagnostic.developerCode = "image_unsupported";
    throw new RasterNormalizeError(
      "この画像形式には対応していません。JPEG / PNG / WEBP でお送りください。",
      diagnostic,
    );
  }

  const sharp = await loadSharp();
  const constructorOptions = {
    failOn: "none" as const,
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
    ...(detectedMime === "image/heic" ? { pages: 1 } : {}),
  };

  let meta: {
    width?: number;
    height?: number;
    space?: string;
    hasAlpha?: boolean;
    hasProfile?: boolean;
    orientation?: number;
    isProgressive?: boolean;
  } | null = null;
  try {
    meta = await sharp(input.buffer, constructorOptions).metadata();
    diagnostic.originalWidth = meta.width ?? null;
    diagnostic.originalHeight = meta.height ?? null;
    diagnostic.space = meta.space ?? null;
    diagnostic.hasAlpha = meta.hasAlpha ?? null;
    diagnostic.hasProfile = meta.hasProfile ?? null;
    diagnostic.orientation = meta.orientation ?? null;
    diagnostic.isProgressive = meta.isProgressive ?? null;
  } catch (error) {
    diagnostic.sharpError = sanitizeSharpMessage(error);
    warnings.push("metadata_failed_decode_retry");
    meta = null;
  }

  const metaWidth = meta?.width ?? 0;
  const metaHeight = meta?.height ?? 0;
  if (metaWidth && metaHeight) {
    if (metaWidth > MAX_EDGE_PX || metaHeight > MAX_EDGE_PX) {
      diagnostic.developerCode = "image_too_large_pixels";
      throw new RasterNormalizeError(
        "画像の解像度が大きすぎるため読み込めませんでした。",
        diagnostic,
      );
    }
    if (metaWidth * metaHeight > MAX_INPUT_PIXELS) {
      diagnostic.developerCode = "image_too_large_pixels";
      throw new RasterNormalizeError(
        "画像の解像度が大きすぎるため読み込めませんでした。",
        diagnostic,
      );
    }
  }

  const maxEdge = Math.max(32, input.maxEdge);
  const jpegQuality = input.jpegQuality ?? 82;
  const preferAlphaPng = Boolean(input.preferAlphaPng) && Boolean(meta?.hasAlpha);
  const hasAlpha = Boolean(meta?.hasAlpha);

  type Attempt = {
    name: RasterFallbackName;
    run: () => Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" }>;
  };

  const attempts: Attempt[] = [];

  if (preferAlphaPng) {
    attempts.push({
      name: "png_alpha",
      run: async () => ({
        buffer: await sharp(input.buffer, constructorOptions)
          .rotate()
          .toColourspace("srgb")
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png({ compressionLevel: 8 })
          .toBuffer(),
        mimeType: "image/png",
      }),
    });
  }

  attempts.push(
    {
      name: "primary_srgb_mozjpeg",
      run: async () => ({
        buffer: await sharp(input.buffer, constructorOptions)
          .rotate()
          .toColourspace("srgb")
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: jpegQuality, mozjpeg: true, chromaSubsampling: "4:2:0" })
          .toBuffer(),
        mimeType: "image/jpeg",
      }),
    },
    {
      name: "srgb_jpeg",
      run: async () => ({
        buffer: await sharp(input.buffer, constructorOptions)
          .rotate()
          .toColourspace("srgb")
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: jpegQuality, chromaSubsampling: "4:2:0" })
          .toBuffer(),
        mimeType: "image/jpeg",
      }),
    },
    {
      name: "plain_jpeg",
      run: async () => ({
        buffer: await sharp(input.buffer, constructorOptions)
          .rotate()
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: jpegQuality })
          .toBuffer(),
        mimeType: "image/jpeg",
      }),
    },
    {
      name: "flatten_jpeg",
      run: async () => ({
        buffer: await sharp(input.buffer, constructorOptions)
          .rotate()
          .flatten({ background: "#ffffff" })
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: Math.min(jpegQuality, 80) })
          .toBuffer(),
        mimeType: "image/jpeg",
      }),
    },
    {
      name: "decoded_reencode",
      run: async () => {
        const decoded = await sharp(input.buffer, constructorOptions)
          .rotate()
          .toBuffer({ resolveWithObject: true });
        diagnostic.decodeOk = true;
        if (decoded.info.width) diagnostic.originalWidth = decoded.info.width;
        if (decoded.info.height) diagnostic.originalHeight = decoded.info.height;
        return {
          buffer: await sharp(decoded.data, constructorOptions)
            .resize({
              width: maxEdge,
              height: maxEdge,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: Math.min(jpegQuality, 78) })
            .toBuffer(),
          mimeType: "image/jpeg",
        };
      },
    },
  );

  let encoded: { buffer: Buffer; mimeType: "image/jpeg" | "image/png" } | null =
    null;
  let lastError: string | null = diagnostic.sharpError;

  for (const attempt of attempts) {
    try {
      encoded = await attempt.run();
      diagnostic.usedFallback = attempt.name;
      if (attempt.name !== "primary_srgb_mozjpeg" && attempt.name !== "png_alpha") {
        warnings.push(`preprocess_fallback:${attempt.name}`);
      }
      diagnostic.decodeOk = true;
      lastError = null;
      break;
    } catch (error) {
      lastError = sanitizeSharpMessage(error);
      diagnostic.sharpError = lastError;
    }
  }

  if (!encoded) {
    // Distinguish "cannot decode" vs "decode worked, encode failed".
    try {
      const decoded = await sharp(input.buffer, constructorOptions).rotate().toBuffer();
      if (decoded.length > MIN_BYTES) {
        diagnostic.decodeOk = true;
        diagnostic.developerCode = "preprocess_encode_failed";
        throw new RasterNormalizeError(
          "画像の前処理に失敗しました。もう一度お試しください。",
          diagnostic,
        );
      }
    } catch (error) {
      if (error instanceof RasterNormalizeError) throw error;
      diagnostic.sharpError = lastError ?? sanitizeSharpMessage(error);
    }
    diagnostic.developerCode = "image_corrupt";
    throw new RasterNormalizeError(
      "この画像を読み込めませんでした。元画像が破損している可能性があります。",
      diagnostic,
    );
  }

  const outMeta = await sharp(encoded.buffer, { failOn: "none" }).metadata();
  const width = outMeta.width ?? diagnostic.originalWidth ?? 0;
  const height = outMeta.height ?? diagnostic.originalHeight ?? 0;
  if (width < MIN_EDGE_PX || height < MIN_EDGE_PX) {
    diagnostic.developerCode = "image_corrupt";
    diagnostic.width = width || null;
    diagnostic.height = height || null;
    throw new RasterNormalizeError(
      "この画像を読み込めませんでした。元画像が破損している可能性があります。",
      diagnostic,
    );
  }

  const outMagic = detectImageMimeFromBytes(encoded.buffer);
  if (outMagic !== encoded.mimeType) {
    diagnostic.developerCode = "preprocess_encode_failed";
    diagnostic.sharpError = `output_magic_mismatch declared=${encoded.mimeType} detected=${outMagic}`;
    throw new RasterNormalizeError(
      "画像の前処理に失敗しました。もう一度お試しください。",
      diagnostic,
    );
  }

  const originalWidth = diagnostic.originalWidth || width;
  const originalHeight = diagnostic.originalHeight || height;
  diagnostic.developerCode = "ok";
  diagnostic.width = width;
  diagnostic.height = height;
  diagnostic.originalWidth = originalWidth;
  diagnostic.originalHeight = originalHeight;
  diagnostic.sharpError = null;
  if (hasAlpha && encoded.mimeType === "image/jpeg") {
    warnings.push("alpha_flattened_to_jpeg");
  }

  return {
    buffer: encoded.buffer,
    mimeType: encoded.mimeType,
    width,
    height,
    originalWidth,
    originalHeight,
    warnings,
    diagnostic,
  };
}

export function userMessageForRasterFailure(code: RasterDeveloperCode): string {
  if (code === "image_empty") return "画像ファイルが空です";
  if (code === "image_too_large_pixels") {
    return "画像の解像度が大きすぎるため読み込めませんでした。";
  }
  if (code === "image_unsupported") {
    return "この画像形式には対応していません。JPEG / PNG / WEBP でお送りください。";
  }
  if (code === "image_corrupt") {
    return "この画像を読み込めませんでした。元画像が破損している可能性があります。";
  }
  return "画像の前処理に失敗しました。もう一度お試しください。";
}
