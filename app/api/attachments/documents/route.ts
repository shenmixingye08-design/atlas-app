import { randomUUID } from "crypto";

import { auth } from "@clerk/nextjs/server";

import { extractDocumentText } from "@/lib/attachments/documents/extract";
import {
  assertDocumentBatchLimits,
  assertSupportedDocument,
  DocumentValidationError,
  sanitizeOriginalFileName,
} from "@/lib/attachments/documents/security";
import { DOCUMENT_ATTACHMENT_LIMITS } from "@/lib/attachments/documents/types";
import { checkPushRateLimit } from "@/lib/push/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "ログインし直してください", code: "authentication_required" },
      { status: 401 },
    );
  }

  if (!(await checkPushRateLimit(`doc-upload:${userId}`, 20, 60_000))) {
    return Response.json(
      { error: "アップロードが集中しています。少し待って再試行してください", code: "rate_limit_exceeded" },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "ファイルのアップロードに失敗しました", code: "upload_failed" },
      { status: 400 },
    );
  }

  const files = form
    .getAll("files")
    .concat(form.getAll("file"))
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return Response.json(
      { error: "ファイルがありません", code: "empty" },
      { status: 400 },
    );
  }

  try {
    const buffers = await Promise.all(
      files.map(async (file) => ({
        fileName: sanitizeOriginalFileName(file.name || "document"),
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
        bytes: file.size,
      })),
    );

    assertDocumentBatchLimits(buffers.map((item) => ({ bytes: item.bytes })));

    const documents = [];
    const warnings: string[] = [];

    for (const item of buffers) {
      const mime = assertSupportedDocument({
        fileName: item.fileName,
        mimeType: item.mimeType,
        bytes: item.bytes,
        buffer: item.buffer,
      });

      const extracted = await extractDocumentText({
        fileName: item.fileName,
        mimeType: mime,
        buffer: item.buffer,
      });

      warnings.push(...extracted.warnings);
      documents.push({
        id: `doc_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
        fileName: item.fileName,
        mimeType: mime,
        bytes: item.bytes,
        extractedText: extracted.text,
        pageOrSheetCount: extracted.pageOrSheetCount,
        warnings: extracted.warnings,
      });
    }

    return Response.json({
      documents,
      warnings,
      limits: {
        maxFilesPerRequest: DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest,
        maxOriginalBytes: DOCUMENT_ATTACHMENT_LIMITS.maxOriginalBytes,
        maxTotalBytes: DOCUMENT_ATTACHMENT_LIMITS.maxTotalBytes,
      },
    });
  } catch (error) {
    if (error instanceof DocumentValidationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    const code =
      error instanceof Error && error.message === "document_parse_failed"
        ? "document_parse_failed"
        : "upload_failed";
    console.warn("[attachments/documents]", code);
    return Response.json(
      {
        error:
          code === "document_parse_failed"
            ? "ファイルの内容を解析できませんでした"
            : "ファイルのアップロードに失敗しました",
        code,
      },
      { status: 500 },
    );
  }
}
