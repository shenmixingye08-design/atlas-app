"use client";

import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";
import {
  logVisionPipeline,
  newVisionTraceId,
} from "@/lib/vision/pipeline-log";

export type UploadedAttachmentClient = {
  id: string;
  fileName: string;
  mimeType: string;
  originalBytes: number;
  processedBytes: number;
  width: number;
  height: number;
  contentHash: string;
  warnings: string[];
};

export type UploadImagesResult = {
  attachments: UploadedAttachmentClient[];
  warnings: string[];
  traceId: string;
};

function isImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext ?? "");
}

export function filterImageFiles(files: File[]): File[] {
  return files.filter(isImageFile).slice(0, ATTACHMENT_LIMITS.maxImagesPerRequest);
}

export async function uploadImagesToAtlas(
  files: File[],
  options?: {
    preferReadableText?: boolean;
    signal?: AbortSignal;
    traceId?: string;
  },
): Promise<UploadImagesResult> {
  const images = filterImageFiles(files);
  const traceId = options?.traceId ?? newVisionTraceId();
  if (images.length === 0) {
    logVisionPipeline({
      stage: "image_dropped",
      ok: false,
      traceId,
      dropReason: "no_image_files_after_filter",
      fileCount: files.length,
    });
    return { attachments: [], warnings: [], traceId };
  }

  const form = new FormData();
  for (const file of images) {
    form.append("files", file, file.name);
  }
  if (options?.preferReadableText) {
    form.append("preferReadableText", "true");
  }

  const formEntries = form.getAll("files");
  logVisionPipeline({
    stage: "formdata_build",
    ok: formEntries.length > 0,
    traceId,
    fileCount: images.length,
    formDataHasFiles: formEntries.length > 0,
    fileName: images[0]?.name ?? null,
    mimeType: images[0]?.type || null,
    byteLength: images[0]?.size ?? null,
  });

  logVisionPipeline({
    stage: "attachment_upload_before",
    ok: true,
    traceId,
    fileCount: images.length,
    fileName: images[0]?.name ?? null,
    mimeType: images[0]?.type || null,
    byteLength: images[0]?.size ?? null,
  });

  const response = await fetch("/api/attachments/images", {
    method: "POST",
    body: form,
    signal: options?.signal,
    headers: {
      "x-atlas-vision-trace": traceId,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    stage?: string;
    providerCode?: string | null;
    attachments?: UploadedAttachmentClient[];
    warnings?: string[];
    traceId?: string;
  };

  const attachments = payload.attachments ?? [];
  logVisionPipeline({
    stage: "attachment_upload_after",
    ok: response.ok && attachments.length > 0,
    traceId: payload.traceId ?? traceId,
    fileCount: attachments.length,
    attachmentIds: attachments.map((a) => a.id),
    attachmentId: attachments[0]?.id ?? null,
    mimeType: attachments[0]?.mimeType ?? null,
    byteLength: attachments[0]?.processedBytes ?? null,
    dropReason: response.ok
      ? attachments.length === 0
        ? "upload_ok_but_empty_attachments"
        : null
      : payload.code ?? "upload_http_failed",
  });

  if (!response.ok) {
    const detail = [payload.code, payload.stage].filter(Boolean).join("@");
    const base = payload.error || "画像のアップロードに失敗しました";
    throw new Error(detail ? `${base}（${detail}）` : base);
  }

  return {
    attachments,
    warnings: payload.warnings ?? [],
    traceId: payload.traceId ?? traceId,
  };
}

export async function analyzeVisionAttachments(input: {
  attachmentIds: string[];
  userText: string;
  detectedType?: string;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}): Promise<{
  batch: {
    id: string;
    status: string;
    combinedSummary: string;
    recommendedArtifactType: string | null;
    warnings: string[];
    needsInput?: { message: string; fields: string[] } | null;
    images: Array<{
      id: string;
      attachmentId: string;
      detectedType: string;
      label: string;
      confidence: number;
      summary: string;
      missingFields: string[];
      warnings: string[];
      cached?: boolean;
    }>;
  };
  label: string | null;
}> {
  const response = await fetch("/api/vision/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachmentIds: input.attachmentIds,
      userText: input.userText,
      detectedType: input.detectedType,
      forceRefresh: input.forceRefresh === true,
    }),
    signal: input.signal,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    batch?: {
      id: string;
      status: string;
      combinedSummary: string;
      recommendedArtifactType: string | null;
      warnings: string[];
      needsInput?: { message: string; fields: string[] } | null;
      images: Array<{
        id: string;
        attachmentId: string;
        detectedType: string;
        label: string;
        confidence: number;
        summary: string;
        missingFields: string[];
        warnings: string[];
        cached?: boolean;
      }>;
    };
    label?: string | null;
  };

  if (!response.ok || !payload.batch) {
    throw new Error(payload.error || "画像解析に失敗しました。再試行してください");
  }

  return { batch: payload.batch, label: payload.label ?? null };
}
