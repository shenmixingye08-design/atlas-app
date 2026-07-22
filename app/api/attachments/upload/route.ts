import { auth } from "@clerk/nextjs/server";

import {
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_IMAGE_UPLOAD_BYTES,
  UNSUPPORTED_IMAGE_TYPE_MESSAGE,
  isImageMimeType,
} from "@/lib/attachments";
import { normalizeImageForVision } from "@/lib/attachments/convert-image";
import { buildSignedAttachmentUrl } from "@/lib/attachments/signed-url";
import { saveAttachment } from "@/lib/attachments/store";

function resolveImageMimeType(file: File): string | null {
  if (isImageMimeType(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.(heic|heif)$/i.test(name)) return "image/heic";
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json(
      {
        status: "error",
        code: "invalid_form",
        message: "アップロード形式が不正です。もう一度画像を添付してください。",
      },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      {
        status: "error",
        code: "file_required",
        message: "画像ファイルを選択してください。",
      },
      { status: 400 },
    );
  }

  const kindRaw = form.get("kind");
  const kind =
    typeof kindRaw === "string" && kindRaw.trim() ? kindRaw.trim() : "photo";

  const mimeType = resolveImageMimeType(file);
  if (!mimeType) {
    return Response.json(
      {
        status: "error",
        code: "unsupported_type",
        message: UNSUPPORTED_IMAGE_TYPE_MESSAGE,
      },
      { status: 415 },
    );
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return Response.json(
      {
        status: "error",
        code: "file_too_large",
        message: IMAGE_TOO_LARGE_MESSAGE,
      },
      { status: 413 },
    );
  }

  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeImageForVision({
      buffer: rawBuffer,
      mimeType,
      fileName: file.name || "image",
    });

    if (!normalized.ok) {
      return Response.json(
        {
          status: "error",
          code: "conversion_failed",
          message: normalized.message,
        },
        { status: 422 },
      );
    }

    const stored = saveAttachment({
      fileName: normalized.fileName,
      mimeType: normalized.mimeType,
      kind,
      buffer: normalized.buffer,
      userId,
    });

    const origin = new URL(request.url).origin;
    const signed = buildSignedAttachmentUrl({
      origin,
      id: stored.id,
      userId,
    });

    return Response.json({
      id: stored.id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      kind: stored.kind,
      /** Auth-gated URL (browser). */
      url: `${origin}/api/attachments/${stored.id}`,
      /** Time-limited signed URL (for external processors when needed). */
      signedUrl: signed.url,
      signedUrlExpiresAt: signed.expiresAt,
      uploadedAt: stored.uploadedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? "Storage保存に失敗しました。もう一度お試しください。"
        : "画像の取得に失敗しました";
    console.error("[attachments/upload]", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { status: "error", code: "storage_failed", message },
      { status: 500 },
    );
  }
}
