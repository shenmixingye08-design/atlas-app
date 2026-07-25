import "server-only";

import { hashImageBytes } from "./image-hash";
import { preprocessImageBuffer } from "./preprocess";
import {
  assertImageBatchLimits,
  assertSupportedImage,
  ImageValidationError,
} from "./image-security";
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
}): Promise<AttachmentUploadResult> {
  const mime = assertSupportedImage({
    mimeType: input.mimeType,
    fileName: input.fileName,
    byteLength: input.buffer.length,
  });

  const contentHash = hashImageBytes(input.buffer);
  const existing = await findAttachmentByHash(input.userId, contentHash);
  if (existing) {
    return { attachment: existing, warnings: ["同一画像のため既存添付を再利用しました"] };
  }

  let processed;
  try {
    processed = await preprocessImageBuffer({
      buffer: input.buffer,
      detail: "auto",
      preferReadableText: input.preferReadableText,
    });
  } catch (error) {
    if (mime === "image/heic" || mime === "image/heif") {
      throw new ImageValidationError(
        "heic_unsupported",
        "このHEIC画像は変換できませんでした。JPEGまたはPNGで送り直してください",
      );
    }
    throw error;
  }

  const attachment = await saveImageAttachment({
    userId: input.userId,
    jobId: input.jobId,
    originalFileName: input.fileName,
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
    });
    results.push(result);
    warnings.push(...result.warnings);
  }
  return { results, warnings };
}
