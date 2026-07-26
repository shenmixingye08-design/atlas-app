"use client";

import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";

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
  options?: { preferReadableText?: boolean; signal?: AbortSignal },
): Promise<UploadImagesResult> {
  const images = filterImageFiles(files);
  if (images.length === 0) {
    return { attachments: [], warnings: [] };
  }

  const form = new FormData();
  for (const file of images) {
    form.append("files", file, file.name);
  }
  if (options?.preferReadableText) {
    form.append("preferReadableText", "true");
  }

  const response = await fetch("/api/attachments/images", {
    method: "POST",
    body: form,
    signal: options?.signal,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    attachments?: UploadedAttachmentClient[];
    warnings?: string[];
  };

  if (!response.ok) {
    throw new Error(payload.error || "画像のアップロードに失敗しました");
  }

  return {
    attachments: payload.attachments ?? [],
    warnings: payload.warnings ?? [],
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
