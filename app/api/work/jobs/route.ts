import { createHash } from "crypto";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";
import { acceptWorkJob } from "@/lib/work-jobs/accept";
import { executeWorkJob } from "@/lib/work-jobs/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Accept a work request and process it as a server job.
 * Browser must not wait for completion — poll GET /api/work/jobs/:id.
 * Same idempotency key → same job (no duplicate execution).
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "確認が必要です。もう一度ログインしてください。" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "依頼内容を確認できませんでした。" },
      { status: 400 },
    );
  }

  const assignment =
    body &&
    typeof body === "object" &&
    typeof (body as { assignment?: unknown }).assignment === "string"
      ? (body as { assignment: string }).assignment.trim()
      : "";

  const clientKey =
    body &&
    typeof body === "object" &&
    typeof (body as { idempotencyKey?: unknown }).idempotencyKey === "string"
      ? (body as { idempotencyKey: string }).idempotencyKey.trim()
      : null;

  const rawMetadata =
    body &&
    typeof body === "object" &&
    (body as { metadata?: unknown }).metadata &&
    typeof (body as { metadata?: unknown }).metadata === "object"
      ? ((body as { metadata: Record<string, unknown> }).metadata ?? {})
      : {};

  // Never trust client-supplied user identity fields.
  const safeMetadata = { ...(rawMetadata as Record<string, unknown>) };
  delete safeMetadata.userId;
  delete safeMetadata.user_id;

  const attachmentIds = Array.isArray(safeMetadata.attachmentIds)
    ? safeMetadata.attachmentIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  logVisionPipeline({
    stage: "job_metadata",
    ok: true,
    attachmentIds,
    attachmentId: attachmentIds[0] ?? null,
    dropReason:
      /画像|レシート|請求|写真|スキャン|明細/.test(assignment) &&
      attachmentIds.length === 0
        ? "image_work_implied_but_no_attachment_ids"
        : null,
  });

  if (!assignment) {
    return Response.json(
      { error: "何をしてほしいかを書いてください。" },
      { status: 400 },
    );
  }

  const accepted = await acceptWorkJob({
    userId,
    assignment,
    clientKey,
    metadata: safeMetadata,
    startExecution: (jobId, uid) => {
      after(async () => {
        try {
          await executeWorkJob(jobId, uid);
        } catch (error) {
          console.warn("[work-jobs]", toHumanReliabilityMessage(error));
        }
      });
    },
  });

  if (!accepted.ok) {
    if (accepted.response) return accepted.response;
    return Response.json(
      {
        ok: false,
        acceptance: "rejected",
        error: accepted.error,
      },
      { status: accepted.httpStatus },
    );
  }

  return Response.json(
    {
      ok: true,
      // 202 = acceptance only — AI/artifacts/Supabase complete later → status completed.
      acceptance: "accepted",
      jobId: accepted.jobId,
      status: accepted.status,
      reused: accepted.reused,
      fingerprint: createHash("sha256")
        .update(accepted.idempotencyKey)
        .digest("hex")
        .slice(0, 12),
      message:
        accepted.status === "completed"
          ? "同じ依頼は処理済みです。"
          : "依頼を受け付けました。バックグラウンドで処理しています。",
    },
    { status: 202 },
  );
}
