import "server-only";

import { toFile } from "openai";

import { getOpenAIClient } from "@/lib/openai";
import type { OpenAiSafeImageMime } from "@/lib/vision/validate-openai-image-payload";
import { VisionError } from "@/lib/vision/types";

/**
 * Upload validated image bytes via Files API (purpose=vision) and return file_id.
 * Prefer this over huge data URLs — avoids JSON base64 transport issues.
 */
export async function uploadVisionImageFile(input: {
  buffer: Buffer;
  mimeType: OpenAiSafeImageMime;
  diagnosticId?: string | null;
}): Promise<{ fileId: string; filename: string }> {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length < 64) {
    throw new VisionError("empty_image", "Files API 用の画像が空です", {
      diagnosticId: input.diagnosticId,
      failedStage: "data_url",
    });
  }

  const ext = input.mimeType === "image/png" ? "png" : "jpg";
  const filename = `atlas-vision-${input.diagnosticId ?? "img"}.${ext}`;

  try {
    const client = getOpenAIClient();
    const file = await client.files.create({
      file: await toFile(input.buffer, filename, { type: input.mimeType }),
      purpose: "vision",
    });
    if (!file?.id) {
      throw new Error("files.create returned empty id");
    }
    console.info("[vision] files_api_upload", {
      diagnosticId: input.diagnosticId ?? null,
      fileId: file.id,
      bytes: input.buffer.length,
      mimeType: input.mimeType,
      filename,
    });
    return { fileId: file.id, filename };
  } catch (error) {
    throw new VisionError(
      "openai_failed",
      "画像の Files API アップロードに失敗しました",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "vision_request",
        details: {
          safeMessage:
            error instanceof Error ? error.message.slice(0, 300) : "files_upload_failed",
        },
        cause: error,
      },
    );
  }
}

/** Best-effort cleanup — never throw into the analyze path. */
export async function deleteVisionImageFile(fileId: string | null | undefined): Promise<void> {
  if (!fileId) return;
  try {
    await getOpenAIClient().files.delete(fileId);
  } catch (error) {
    console.warn("[vision] files_api_delete_failed", {
      fileId,
      message: error instanceof Error ? error.message.slice(0, 120) : "delete_failed",
    });
  }
}
