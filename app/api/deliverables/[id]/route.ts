import { auth } from "@clerk/nextjs/server";

import {
  assertOfficeBinaryOrThrow,
  ensureFormatFileName,
  mimeTypeForFormat,
} from "@/lib/deliverables/binary-guards";
import { markDeliverableDownloaded } from "@/lib/deliverables/durable-store";
import {
  getStoredDeliverableForUser,
  isDeliverableOwnedByOtherUser,
} from "@/lib/deliverables/store";
import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";
import { recordReliabilityEvent } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "確認が必要です。もう一度ログインしてください。" },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  if (isDeliverableOwnedByOtherUser(id, userId)) {
    recordReliabilityEvent("deliverable_download", "failure");
    return Response.json(
      { error: "この成果物へのアクセス権がありません。" },
      { status: 403 },
    );
  }

  const stored = await getStoredDeliverableForUser(id, userId);

  if (!stored) {
    recordReliabilityEvent("deliverable_download", "failure");
    return Response.json(
      {
        error: toHumanReliabilityMessage("not found or expired"),
      },
      { status: 404 },
    );
  }

  // Force canonical MIME by format — never trust a stale/wrong stored mimeType
  // that could become text/plain or application/octet-stream in the browser.
  const contentType = mimeTypeForFormat(stored.format);
  const fileName = ensureFormatFileName(stored.fileName, stored.format);

  // Copy into a standalone Uint8Array (completed binary only).
  const body = new Uint8Array(stored.buffer.byteLength);
  body.set(stored.buffer);

  if (body.byteLength === 0) {
    recordReliabilityEvent("deliverable_download", "failure");
    return Response.json(
      { error: "成果物を作り直しています。" },
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
    return Response.json(
      {
        error:
          stored.format === "docx"
            ? "保存されたWordファイルが壊れていました。再生成してください。"
            : "成果物ファイルが壊れていました。再生成してください。",
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
    return Response.json(
      { error: "WordファイルのContent-Typeが不正です。" },
      { status: 500 },
    );
  }

  markDeliverableDownloaded(stored.id, userId);
  recordReliabilityEvent("deliverable_download", "success");
  recordReliabilityEvent("deliverable_generate", "success");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": buildAttachmentContentDisposition(fileName),
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
