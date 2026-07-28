import { createHash } from "crypto";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { notifyWorkAccepted } from "@/lib/notifications/work-lifecycle";
import { MAX_IMMEDIATE_RETRIES } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { isTerminalJobStatus } from "@/lib/work-jobs/job-status";
import { executeWorkJob, isStaleWorkJobRunning } from "@/lib/work-jobs/run";
import {
  buildWorkJobIdempotencyKey,
  findWorkJobByIdempotencyKey,
  saveWorkJob,
} from "@/lib/work-jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Accept a work request and process it as a server job.
 * Browser must not wait for completion — poll GET /api/work/jobs/:id.
 * Same idempotency key → same job (no duplicate execution / notifications).
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
    // Terminal jobs are immutable. Stale processing may be reclaimed.
    const shouldRestart =
      existing.status === "queued" ||
      (existing.status === "processing" &&
        existing.blockReason == null &&
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
        jobId: existing.id,
        status: existing.status,
        blockReason: existing.blockReason,
        errorCode: existing.errorCode,
        reused: true,
        terminal: isTerminalJobStatus(existing.status),
        message:
          existing.status === "completed"
            ? "同じ依頼は処理済みです。"
            : existing.blockReason === "awaiting_confirmation"
              ? "確認が必要です。"
              : "依頼を受け付けました。バックグラウンドで処理しています。",
      },
      { status: 202 },
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  saveWorkJob({
    id,
    userId,
    assignment,
    idempotencyKey,
    metadata: safeMetadata,
    status: "queued",
    blockReason: null,
    attemptCount: 0,
    maxAttempts: MAX_IMMEDIATE_RETRIES,
    error: null,
    errorCode: null,
    internalError: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
  });

  // Inbox: 仕事受付 — separate from deliverable/result empty states.
  notifyWorkAccepted({ userId, jobId: id, assignment });

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
      jobId: id,
      status: "queued",
      blockReason: null,
      errorCode: null,
      reused: false,
      terminal: false,
      fingerprint: createHash("sha256")
        .update(idempotencyKey)
        .digest("hex")
        .slice(0, 12),
      message:
        "依頼を受け付けました。バックグラウンドで処理しています。",
    },
    { status: 202 },
  );
}
