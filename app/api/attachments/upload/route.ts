import { auth } from "@clerk/nextjs/server";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  isImageMimeType,
} from "@/lib/attachments";
import { saveAttachment } from "@/lib/attachments/store";

function resolveImageMimeType(file: File): string | null {
  if (isImageMimeType(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.bmp$/i.test(name)) return "image/bmp";
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
      { status: "error", message: "multipart form data required" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { status: "error", message: "file is required" },
      { status: 400 },
    );
  }

  const kindRaw = form.get("kind");
  const kind =
    typeof kindRaw === "string" && kindRaw.trim() ? kindRaw.trim() : "photo";

  const mimeType = resolveImageMimeType(file);
  if (!mimeType && kind !== "photo") {
    return Response.json(
      { status: "error", message: "image files only" },
      { status: 400 },
    );
  }

  const resolvedMime = mimeType ?? "image/jpeg";

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return Response.json(
      {
        status: "error",
        message: "画像サイズが上限を超えています",
      },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = saveAttachment({
      fileName: file.name || "image",
      mimeType: resolvedMime,
      kind,
      buffer,
      userId,
    });

    const origin = new URL(request.url).origin;

    return Response.json({
      id: stored.id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      kind: stored.kind,
      url: `${origin}/api/attachments/${stored.id}`,
      uploadedAt: stored.uploadedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "画像の取得に失敗しました";
    console.error("[attachments/upload]", error);
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
