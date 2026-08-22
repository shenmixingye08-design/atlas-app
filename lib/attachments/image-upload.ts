import "server-only";

import {
  RasterNormalizeError,
  userMessageForRasterFailure,
} from "@/lib/images/normalize-raster";
import {
  assertImageMagicMatchesDeclaration,
  detectImageMimeFromBytes,
  looksLikeSvgOrHtml,
} from "@/lib/security/file-magic";
import { sanitizeDisplayFileName } from "@/lib/security/upload-path";

import { hashImageBytes } from "./image-hash";
import { preprocessImageBuffer } from "./preprocess";
import {
  assertImageBatchLimits,
  assertSupportedImage,
  ImageValidationError,
} from "./image-security";
import { AttachmentStorageError } from "./errors";
import {
  findAttachmentByHash,
  saveImageAttachment,
} from "./store";
import type { AttachmentRetentionPolicy } from "./constants";
import type { AttachmentUploadResult } from "./types";

export async function uploadUserImage(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  preferReadableText?: boolean;
  jobId?: string | null;
  retentionPolicy?: AttachmentRetentionPolicy;
  forceReprocess?: boolean;
  diagnosticId?: string | null;
}): Promise<AttachmentUploadResult> {
  let safeName: string;
  try {
    safeName = sanitizeDisplayFileName(input.fileName);
  } catch {
    throw new ImageValidationError("unsupported_type", "不正なファイル名です");
  }

  if (looksLikeSvgOrHtml(input.buffer)) {
    throw new ImageValidationError(
      "unsupported_type",
      "SVG/HTML 画像はアップロードできません",
    );
  }
  const detected = detectImageMimeFromBytes(input.buffer);
  let mime: string;
  try {
    mime = assertImageMagicMatchesDeclaration({
      declaredMime: detected ?? input.mimeType,
      fileName: safeName,
      buffer: input.buffer,
    }).mime;
  } catch {
    throw new ImageValidationError(
      "unsupported_type",
      "画像形式を確認できませんでした。JPEG/PNG/WEBPで送り直してください",
    );
  }
  mime = assertSupportedImage({
    mimeType: mime,
    fileName: safeName,
    byteLength: input.buffer.length,
  });

  const contentHash = hashImageBytes(input.buffer);
  const existing =
    input.forceReprocess
      ? null
      : await findAttachmentByHash(input.userId, contentHash);
  if (existing) {
    // Reuse only when processed bytes are still a real image — orphaned /
    // corrupted Storage objects must not short-circuit a fresh upload.
    const { readProcessedImageBytes } = await import("./store");
    const { detectImageMimeFromBytes } = await import(
      "@/lib/vision/image-magic"
    );
    const readable = await readProcessedImageBytes(input.userId, existing.id);
    const mimeOk =
      readable &&
      readable.buffer.length > 64 &&
      Boolean(detectImageMimeFromBytes(readable.buffer));
    if (mimeOk && readable) {
      return {
        attachment: existing,
        warnings: ["同一画像のため既存添付を再利用しました"],
      };
    }
    // Stale / corrupt hash hit: delete orphan and continue with a new save.
    try {
      const { deleteImageAttachment } = await import("./store");
      await deleteImageAttachment(input.userId, existing.id);
    } catch {
      /* best-effort */
    }
  }

  let processed;
  try {
    processed = await preprocessImageBuffer({
      buffer: input.buffer,
      detail: "auto",
      preferReadableText: input.preferReadableText,
      diagnosticId: input.diagnosticId,
    });
  } catch (error) {
    if (mime === "image/heic" || mime === "image/heif") {
      throw new ImageValidationError(
        "heic_unsupported",
        "このHEIC画像は変換できませんでした。JPEGまたはPNGで送り直してください",
      );
    }
    if (error instanceof RasterNormalizeError) {
      const diagnostic = error.diagnostic;
      console.error("[attachments] preprocess failed", {
        diagnosticId: diagnostic.diagnosticId,
        developerCode: diagnostic.developerCode,
        failedStage: diagnostic.failedStage,
        detectedMime: diagnostic.detectedMime,
        declaredMime: input.mimeType || null,
        fileName: safeName,
        extension: safeName.split(".").pop()?.toLowerCase() ?? null,
        byteLength: diagnostic.byteLength,
        width: diagnostic.originalWidth,
        height: diagnostic.originalHeight,
        space: diagnostic.space,
        isProgressive: diagnostic.isProgressive,
        orientation: diagnostic.orientation,
        hasAlpha: diagnostic.hasAlpha,
        usedFallback: diagnostic.usedFallback,
        decodeOk: diagnostic.decodeOk,
        sharpError: diagnostic.sharpError,
        headHex32: diagnostic.headHex32,
        storageAttempted: false,
      });
      throw new AttachmentStorageError({
        code:
          diagnostic.developerCode === "image_corrupt"
            ? "image_corrupt"
            : "preprocess_failed",
        stage: "preprocess.sharp",
        providerMessage: diagnostic.sharpError ?? error.message,
        diagnosticId: diagnostic.diagnosticId,
        developerCode: diagnostic.developerCode,
        failedStage: "preprocess",
        userMessage: userMessageForRasterFailure(diagnostic.developerCode),
        cause: error,
      });
    }
    throw new AttachmentStorageError({
      code: "preprocess_failed",
      stage: "preprocess.sharp",
      providerMessage: error instanceof Error ? error.message : undefined,
      failedStage: "preprocess",
      developerCode: "preprocess_failed",
      diagnosticId: input.diagnosticId ?? undefined,
      cause: error,
    });
  }

  console.info("[attachments] preprocess ok", {
    diagnosticId: processed.diagnostic.diagnosticId,
    developerCode: processed.diagnostic.developerCode,
    failedStage: "preprocess",
    detectedMime: processed.diagnostic.detectedMime,
    outputMime: processed.mimeType,
    fileName: safeName,
    byteLength: processed.diagnostic.byteLength,
    width: processed.width,
    height: processed.height,
    space: processed.diagnostic.space,
    isProgressive: processed.diagnostic.isProgressive,
    orientation: processed.diagnostic.orientation,
    usedFallback: processed.diagnostic.usedFallback,
    storageAttempted: true,
  });

  const attachment = await saveImageAttachment({
    userId: input.userId,
    jobId: input.jobId,
    originalFileName: safeName,
    mimeType: mime,
    originalBuffer: input.buffer,
    processedBuffer: processed.buffer,
    processedMimeType: processed.mimeType,
    width: processed.width,
    height: processed.height,
    contentHash,
    retentionPolicy: input.retentionPolicy ?? "temporary",
  });

  return { attachment, warnings: processed.warnings };
}

export async function uploadUserImages(input: {
  userId: string;
  files: Array<{ fileName: string; mimeType: string; buffer: Buffer }>;
  preferReadableText?: boolean;
  jobId?: string | null;
  retentionPolicy?: AttachmentRetentionPolicy;
  forceReprocess?: boolean;
  diagnosticId?: string | null;
}): Promise<{ results: AttachmentUploadResult[]; warnings: string[] }> {
  assertImageBatchLimits(
    input.files.length,
    input.files.reduce((sum, file) => sum + file.buffer.length, 0),
  );

  const results: AttachmentUploadResult[] = [];
  const warnings: string[] = [];
  for (const file of input.files) {
    const result = await uploadUserImage({
      userId: input.userId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      buffer: file.buffer,
      preferReadableText: input.preferReadableText,
      jobId: input.jobId,
      retentionPolicy: input.retentionPolicy,
      forceReprocess: input.forceReprocess,
      diagnosticId: input.diagnosticId,
    });
    results.push(result);
    warnings.push(...result.warnings);
  }
  return { results, warnings };
}
