import { auth } from "@clerk/nextjs/server";

import {
  ATTACHMENT_LIMITS,
  ImageValidationError,
  uploadUserImages,
} from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "画像のアップロードに失敗しました", code: "upload_failed" },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .concat(form.getAll("file"))
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return Response.json(
      { error: "画像ファイルがありません", code: "empty" },
      { status: 400 },
    );
  }

  try {
    const buffers = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name || "image.jpg",
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const preferReadableText = form.get("preferReadableText") === "true";
    const jobIdRaw = form.get("jobId");
    const jobId =
      typeof jobIdRaw === "string" && jobIdRaw.trim() ? jobIdRaw.trim() : null;
    const retentionRaw = form.get("retentionPolicy");
    const retentionPolicy =
      retentionRaw === "retained" ? ("retained" as const) : ("temporary" as const);

    const { results, warnings } = await uploadUserImages({
      userId,
      files: buffers,
      preferReadableText,
      jobId,
      retentionPolicy,
    });

    return Response.json({
      attachments: results.map((result) => ({
        id: result.attachment.id,
        jobId: result.attachment.jobId,
        fileName: result.attachment.originalFileName,
        mimeType: result.attachment.mimeType,
        originalBytes: result.attachment.originalBytes,
        processedBytes: result.attachment.processedBytes,
        width: result.attachment.width,
        height: result.attachment.height,
        contentHash: result.attachment.contentHash,
        createdAt: result.attachment.createdAt,
        expiresAt: result.attachment.expiresAt,
        retentionPolicy: result.attachment.retentionPolicy,
        storageBackend: result.attachment.storageBackend,
        warnings: result.warnings,
      })),
      warnings,
      limits: {
        maxImagesPerRequest: ATTACHMENT_LIMITS.maxImagesPerRequest,
        maxOriginalBytes: ATTACHMENT_LIMITS.maxOriginalBytes,
      },
    });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    console.error("[attachments] upload failed");
    return Response.json(
      { error: "画像のアップロードに失敗しました", code: "upload_failed" },
      { status: 500 },
    );
  }
}
