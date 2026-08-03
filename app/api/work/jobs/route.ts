import { createHash } from "crypto";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { admitJobToQueue } from "@/lib/queue/overflow";
import { createJobAuditTrail } from "@/lib/queue/audit";
import { MAX_IMMEDIATE_RETRIES } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";
import { withPropagatedJobId } from "@/lib/work-jobs/job-id";
import { executeWorkJob, isStaleWorkJobRunning } from "@/lib/work-jobs/run";
import {
  buildWorkJobIdempotencyKey,
  findWorkJobByIdempotencyKey,
  getWorkJobQueueSnapshot,
  isWorkJobInProgressStatus,
  saveWorkJob,
} from "@/lib/work-jobs/store";

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

  const idempotencyKey = buildWorkJobIdempotencyKey({
    userId,
    assignment,
    clientKey,
  });

  const existing = findWorkJobByIdempotencyKey(userId, idempotencyKey);
  if (existing) {
    const shouldRestart =
      existing.status === "queued" ||
      existing.status === "failed" ||
      existing.status === "retrying" ||
      (isWorkJobInProgressStatus(existing.status) &&
        isStaleWorkJobRunning(existing));
    if (shouldRestart) {
      after(async () => {
        try {
          await executeWorkJob(existing.id, userId);
        } catch (error) {
          console.warn("[work-jobs]", toHumanReliabilityMessage(error));
        }
      });
    }
    return Response.json(
      {
        ok: true,
        // 202 = acceptance only — never implies completed.
        acceptance: "accepted",
        jobId: existing.id,
        status: existing.status,
        stage: existing.stage ?? existing.status,
        reused: true,
        duplicate: true,
        message:
          existing.status === "completed"
            ? "同じ依頼は処理済みです。"
            : "依頼を受け付けました。バックグラウンドで処理しています。",
      },
      { status: 202 },
    );
  }

  const snapshot = getWorkJobQueueSnapshot(userId);
  const admit = admitJobToQueue({ snapshot });
  if (!admit.admit) {
    return Response.json(
      {
        ok: false,
        acceptance: "rejected",
        error: admit.message,
        reason: admit.reason,
        queue: snapshot,
      },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await saveWorkJob({
      id,
      userId,
      assignment,
      idempotencyKey,
      metadata: withPropagatedJobId(safeMetadata, id),
      status: "queued",
      stage: "queued",
      progressPercent: 0,
      currentStep: "受付済み・待機中",
      attemptCount: 0,
      maxAttempts: MAX_IMMEDIATE_RETRIES,
      error: null,
      visionGate: null,
      result: null,
      requestId: id,
      statusHistory: [
        { from: null, to: "queued", at: now, reason: "accepted" },
      ],
      audit: createJobAuditTrail({ jobId: id, requestId: id }),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
  } catch {
    return Response.json(
      {
        ok: false,
        acceptance: "rejected",
        error: "依頼の保存に失敗しました。しばらくしてからもう一度お試しください。",
      },
      { status: 503 },
    );
  }

  after(async () => {
    try {
      await executeWorkJob(id, userId);
    } catch (error) {
      console.warn("[work-jobs]", toHumanReliabilityMessage(error));
    }
  });

  return Response.json(
    {
      ok: true,
      // 202 = acceptance only — AI/artifacts/Supabase complete later → status completed.
      acceptance: "accepted",
      jobId: id,
      status: "queued",
      reused: false,
      fingerprint: createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 12),
      message:
        "依頼を受け付けました。バックグラウンドで処理しています。",
    },
    { status: 202 },
  );
}
