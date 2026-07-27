import { auth } from "@clerk/nextjs/server";

import {
  assertOfficeBinaryOrThrow,
  ensureFormatFileName,
  mimeTypeForFormat,
} from "@/lib/deliverables/binary-guards";
import { markDeliverableDownloaded } from "@/lib/deliverables/durable-store";
import {
  getStoredDeliverableForUser,
  recoverDeliverableBinary,
} from "@/lib/deliverables/store";
import { consumeWordFault } from "@/lib/deliverables/fault-inject";
import { assertDownloadIntegrity, sha256Hex } from "@/lib/deliverables/integrity";
import {
  classifyDeliverableError,
  userMessageForFailure,
} from "@/lib/deliverables/recovery-messages";
import { recordWordMetric } from "@/lib/deliverables/word-metrics";
import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";
import { recordReliabilityEvent } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const downloadStarted = Date.now();
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: userMessageForFailure("auth") },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  let stored = await getStoredDeliverableForUser(id, userId);

  if (!stored) {
    recordReliabilityEvent("deliverable_download", "failure");
    recordWordMetric("download_failure", 1, { stage: "lookup" });
    return Response.json(
      {
        error: toHumanReliabilityMessage("not found or expired"),
        availability: "expired",
        actions: ["regenerate_word_only", "retry", "send_support_info"],
      },
      { status: 404 },
    );
  }

  // Force canonical MIME by format — never trust a stale/wrong stored mimeType
  // that could become text/plain or application/octet-stream in the browser.
  let contentType = mimeTypeForFormat(stored.format);
  let fileName = ensureFormatFileName(stored.fileName, stored.format);

  let integrity = assertDownloadIntegrity({
    buffer: stored.buffer,
    format: stored.format,
    fileName,
    contentType,
    expectedSizeBytes: stored.buffer.byteLength,
    expectedSha256: stored.contentSha256 ?? null,
    requireOoxml: stored.format === "docx",
  });

  // Fault-injectable integrity failure (tests / preview only).
  if (consumeWordFault("sha256_mismatch_on_download")) {
    integrity = { ok: false, issues: ["sha256_mismatch"] };
  }

  if (!integrity.ok) {
    // Automatic recovery: clear caches → durable → regenerate → re-verify.
    const recovered = await recoverDeliverableBinary(id, userId);
    if (!recovered) {
      recordReliabilityEvent("deliverable_download", "failure", 1, {
        errorCode: "integrity_recovery_failed",
        errorMessage: integrity.issues.join(","),
      });
      recordWordMetric("download_failure", 1, {
        stage: "integrity",
        message: integrity.issues.join(","),
      });
      return Response.json(
        {
          error: userMessageForFailure(
            classifyDeliverableError(integrity.issues.join(",")),
          ),
          availability: "recovery_failed",
          actions: ["retry_download", "regenerate_word_only", "send_support_info"],
        },
        { status: 500 },
      );
    }
    stored = recovered;
    contentType = mimeTypeForFormat(stored.format);
    fileName = ensureFormatFileName(stored.fileName, stored.format);
    integrity = assertDownloadIntegrity({
      buffer: stored.buffer,
      format: stored.format,
      fileName,
      contentType,
      expectedSha256: stored.contentSha256 ?? null,
      requireOoxml: stored.format === "docx",
    });
    if (!integrity.ok) {
      recordReliabilityEvent("deliverable_download", "failure", 1, {
        errorCode: "integrity_failed_after_recovery",
        errorMessage: integrity.issues.join(","),
      });
      recordWordMetric("download_failure", 1, { stage: "integrity_after_recovery" });
      return Response.json(
        {
          error: userMessageForFailure("recovery_failed"),
          availability: "recovery_failed",
        },
        { status: 500 },
      );
    }
    recordWordMetric("recovery_success");
  }

  // Copy into a standalone Uint8Array (completed binary only).
  const body = new Uint8Array(stored.buffer.byteLength);
  body.set(stored.buffer);

  if (body.byteLength === 0) {
    recordReliabilityEvent("deliverable_download", "failure");
    recordWordMetric("download_failure", 1, { stage: "empty" });
    return Response.json(
      { error: "成果物を作り直しています。", availability: "regenerating" },
      { status: 500 },
    );
  }

  try {
    assertOfficeBinaryOrThrow(stored.format, body);
  } catch {
    recordReliabilityEvent("deliverable_download", "failure", 1, {
      errorCode: "invalid_binary",
      errorMessage: `format=${stored.format}`,
    });
    recordWordMetric("download_failure", 1, { stage: "binary_guard" });
    return Response.json(
      {
        error:
          stored.format === "docx"
            ? "Word生成失敗: 完成した.docxではありません。再生成してください。"
            : "成果物ファイルが壊れていました。再生成してください。",
        availability: "recovery_failed",
      },
      { status: 500 },
    );
  }

  // Forbidden MIME types must never leave this route for Office files.
  if (
    contentType === "text/plain" ||
    contentType === "application/json" ||
    contentType === "application/octet-stream"
  ) {
    recordReliabilityEvent("deliverable_download", "failure");
    recordWordMetric("download_failure", 1, { stage: "mime" });
    return Response.json(
      { error: "Word生成失敗: 不正なContent-Typeです。" },
      { status: 500 },
    );
  }

  markDeliverableDownloaded(stored.id, userId);
  recordReliabilityEvent("deliverable_download", "success");
  recordReliabilityEvent("deliverable_generate", "success");
  recordWordMetric("download_success");
  recordWordMetric("download_ms", Date.now() - downloadStarted);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": buildAttachmentContentDisposition(fileName),
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Atlas-Content-SHA256": stored.contentSha256 ?? sha256Hex(stored.buffer),
    },
  });
}
