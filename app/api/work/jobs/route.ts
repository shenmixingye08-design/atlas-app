import { createHash } from "crypto";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { notifyWorkAccepted } from "@/lib/notifications/work-lifecycle";
import { MAX_IMMEDIATE_RETRIES } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { appendJobEvent } from "@/lib/work-jobs/event-log";
import { isTerminalJobStatus } from "@/lib/work-jobs/job-status";
import {
  JOB_ACCEPTED_DESCRIPTION,
  JOB_ACCEPTED_TITLE,
} from "@/lib/work-jobs/progress";
import { executeWorkJob, isStaleWorkJobRunning } from "@/lib/work-jobs/run";
import {
  buildWorkJobIdempotencyKey,
  findWorkJobByIdempotencyKey,
  saveWorkJob,
} from "@/lib/work-jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACCEPTED_MESSAGE = `${JOB_ACCEPTED_TITLE}\n${JOB_ACCEPTED_DESCRIPTION}`;

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
        progressPhase: "accepted",
        progressLabel: JOB_ACCEPTED_TITLE,
        message:
          existing.status === "completed"
            ? "成果物が完成しました。"
            : existing.blockReason === "awaiting_confirmation"
              ? "確認が必要です。"
              : ACCEPTED_MESSAGE,
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
    metadata: {
      ...safeMetadata,
      progressPhase: "accepted",
      progressUpdatedAt: now,
      events: [
        {
          type: "accepted",
          at: now,
          phase: "accepted",
          reason: null,
          durationMs: null,
          deliverableId: null,
        },
      ],
      lastEventType: "accepted",
      lastEventAt: now,
    },
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

  // Inbox: 受付 — separate from deliverable/result empty states.
  notifyWorkAccepted({ userId, jobId: id, assignment });
  appendJobEvent(id, userId, {
    type: "accepted",
    phase: "accepted",
    at: now,
  });

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
      progressPhase: "accepted",
      progressLabel: JOB_ACCEPTED_TITLE,
      fingerprint: createHash("sha256")
        .update(idempotencyKey)
        .digest("hex")
        .slice(0, 12),
      message: ACCEPTED_MESSAGE,
    },
    { status: 202 },
  );
}
