import { auth } from "@clerk/nextjs/server";

import {
  ATTACHMENT_LIMITS,
  ImageValidationError,
  uploadUserImages,
} from "@/lib/attachments";
import {
  AttachmentStorageError,
  logAttachmentError,
} from "@/lib/attachments/errors";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  const traceId =
    request.headers.get("x-atlas-vision-trace")?.trim() ||
    `vtr_srv_${Date.now().toString(36)}`;
  if (!userId) {
    logVisionPipeline({
      stage: "attachment_upload_after",
      ok: false,
      traceId,
      dropReason: "unauthorized",
    });
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    logAttachmentError(error, { stage: "http.formData", userId });
    logVisionPipeline({
      stage: "formdata_build",
      ok: false,
      traceId,
      dropReason: "formdata_parse_failed",
    });
    return Response.json(
      {
        error: "画像の受信に失敗しました（FormData）",
        code: "formdata_failed",
        stage: "http.formData",
        traceId,
      },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .concat(form.getAll("file"))
    .filter((entry): entry is File => entry instanceof File);

  logVisionPipeline({
    stage: "formdata_build",
    ok: files.length > 0,
    traceId,
    fileCount: files.length,
    formDataHasFiles: files.length > 0,
    fileName: files[0]?.name ?? null,
    mimeType: files[0]?.type || null,
    byteLength: files[0]?.size ?? null,
  });

  if (files.length === 0) {
    logVisionPipeline({
      stage: "image_dropped",
      ok: false,
      traceId,
      dropReason: "formdata_no_files_field",
    });
    return Response.json(
      {
        error: "画像ファイルがありません",
        code: "empty",
        stage: "http.files",
        traceId,
      },
      { status: 400 },
    );
  }

  // Cap monthly image uploads to stop free-user flood / paid bypass.
  const {
    assertDeliverableQuota,
    consumeDeliverableQuota,
    deliverableQuotaDeniedResponse,
  } = await import("@/lib/security/billing/free-user-controls");
  const imageQuota = await assertDeliverableQuota({
    userId,
    kind: "image",
  });
  if (!imageQuota.allowed || imageQuota.used + files.length > imageQuota.limit) {
    logVisionPipeline({
      stage: "attachment_upload_after",
      ok: false,
      traceId,
      dropReason: "billing_quota",
    });
    if (!imageQuota.allowed) {
      return deliverableQuotaDeniedResponse(imageQuota);
    }
    return Response.json(
      {
        error: `画像アップロードの月間上限（${imageQuota.limit}件）を超えます`,
        code: "quota_exceeded",
        used: imageQuota.used,
        limit: imageQuota.limit,
        request_id: imageQuota.request_id,
        upgradePath: "/settings/billing",
      },
      { status: 429 },
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

    const emptyBuffers = buffers.filter((b) => b.buffer.length === 0);
    logVisionPipeline({
      stage: "attachment_upload_before",
      ok: emptyBuffers.length === 0,
      traceId,
      fileCount: buffers.length,
      fileName: buffers[0]?.fileName ?? null,
      mimeType: buffers[0]?.mimeType ?? null,
      byteLength: buffers[0]?.buffer.length ?? null,
      headHex32: buffers[0]
        ? buffers[0].buffer.subarray(0, 32).toString("hex")
        : null,
      dropReason:
        emptyBuffers.length > 0 ? "file_arraybuffer_empty" : null,
    });

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

    const attachments = results.map((result) => ({
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
    }));

    for (let n = 0; n < attachments.length; n += 1) {
      consumeDeliverableQuota({ userId, kind: "image" });
    }

    logVisionPipeline({
      stage: "attachment_upload_after",
      ok: attachments.length > 0,
      traceId,
      attachmentIds: attachments.map((a) => a.id),
      attachmentId: attachments[0]?.id ?? null,
      mimeType: attachments[0]?.mimeType ?? null,
      byteLength: attachments[0]?.processedBytes ?? null,
      fileCount: attachments.length,
    });

    return Response.json({
      attachments,
      warnings,
      traceId,
      limits: {
        maxImagesPerRequest: ATTACHMENT_LIMITS.maxImagesPerRequest,
        maxOriginalBytes: ATTACHMENT_LIMITS.maxOriginalBytes,
      },
    });
  } catch (error) {
    logAttachmentError(error, { stage: "http.uploadUserImages", userId });

    if (error instanceof ImageValidationError) {
      return Response.json(
        { error: error.message, code: error.code, stage: "validation" },
        { status: 400 },
      );
    }

    if (error instanceof AttachmentStorageError) {
      const status =
        error.code === "config_missing" ||
        error.code === "table_missing" ||
        error.code === "bucket_missing"
          ? 503
          : 500;
      return Response.json(
        {
          error: error.message,
          code: error.code,
          stage: error.stage,
          providerCode: error.providerCode ?? null,
        },
        { status },
      );
    }

    const message =
      error instanceof Error && error.message.includes("画像を読み取れませんでした")
        ? error.message
        : "画像のアップロードに失敗しました";

    return Response.json(
      {
        error: message,
        code: "upload_failed",
        stage: "http.uploadUserImages",
      },
      { status: 500 },
    );
  }
}
