import { createHash } from "crypto";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { MAX_IMMEDIATE_RETRIES } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  buildUnderstandingLog,
  buildUnderstandingPublicView,
} from "@/lib/request-understanding/diagnostics";
import { withUnderstandingMetadata } from "@/lib/request-understanding/bridge";
import { routeRequest } from "@/lib/request-understanding/route";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";
import { withPropagatedJobId } from "@/lib/work-jobs/job-id";
import { executeWorkJob } from "@/lib/work-jobs/run";
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

  const understandStarted = Date.now();
  const preferredFormat =
    typeof safeMetadata.preferredDeliverableFormat === "string"
      ? safeMetadata.preferredDeliverableFormat
      : null;
  const routeDecision = routeRequest({
    assignment,
    userId,
    preferredFormat,
    attachments: attachmentIds.map((id) => ({ id })),
    idempotencyKey: clientKey,
  });
  const enrichedMetadata = withUnderstandingMetadata(
    safeMetadata,
    assignment,
  );
  console.info(
    "[request-understanding]",
    buildUnderstandingLog({
      userId,
      rawInputLength: assignment.length,
      attachmentCount: attachmentIds.length,
      decision: routeDecision,
      durationMs: Date.now() - understandStarted,
    }),
  );

  // Block when unsupported, attachment missing, hard required gaps, or very low confidence.
  // Mid-confidence with only safe assumptions still proceeds (assumptions in metadata).
  const blockingMissing = routeDecision.parsed.missing_required_fields.filter(
    (field) => field !== "attachment",
  );
  const hardBlock =
    routeDecision.target === "unsupported" ||
    routeDecision.parsed.missing_required_fields.includes("attachment") ||
    routeDecision.parsed.confidence < 0.4 ||
    (routeDecision.parsed.needs_clarification && blockingMissing.length > 0);
  if (hardBlock) {
    return Response.json(
      {
        ok: false,
        acceptance:
          routeDecision.target === "unsupported" ? "rejected" : "needs_input",
        code: routeDecision.developerCode,
        error: routeDecision.userMessage,
        understanding: buildUnderstandingPublicView(routeDecision.parsed),
      },
      { status: routeDecision.target === "unsupported" ? 422 : 409 },
    );
  }

  Object.assign(safeMetadata, enrichedMetadata);

  const idempotencyKey = buildWorkJobIdempotencyKey({
    userId,
    assignment,
    clientKey,
  });

  const existing = findWorkJobByIdempotencyKey(userId, idempotencyKey);
  if (existing) {
    const { isStaleWorkJobRunning } = await import("@/lib/work-jobs/run");
    const shouldRestart =
      existing.status === "queued" ||
      existing.status === "failed" ||
      (existing.status === "running" && isStaleWorkJobRunning(existing));
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
        reused: true,
        message:
          existing.status === "completed"
            ? "同じ依頼は処理済みです。"
            : "依頼を受け付けました。バックグラウンドで処理しています。",
      },
      { status: 202 },
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
      attemptCount: 0,
      maxAttempts: MAX_IMMEDIATE_RETRIES,
      error: null,
      visionGate: null,
      result: null,
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
