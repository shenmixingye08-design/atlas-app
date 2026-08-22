import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  executeWorkJob,
  isStaleWorkJobQueued,
  isStaleWorkJobRunning,
} from "@/lib/work-jobs/run";
import { getWorkJobDurable } from "@/lib/work-jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/** Poll work job status — browser does not hold the orchestration connection. */
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
  let job = await getWorkJobDurable(id, userId);
  if (!job) {
    return Response.json(
      { error: "依頼が見つかりません。もう一度送ってください。" },
      { status: 404 },
    );
  }

  // Stale running / never-started queued must not stay 処理中 — reclaim on poll.
  if (
    (job.status === "running" && isStaleWorkJobRunning(job)) ||
    isStaleWorkJobQueued(job)
  ) {
    after(async () => {
      try {
        await executeWorkJob(id, userId);
      } catch (error) {
        console.warn("[work-jobs/poll]", toHumanReliabilityMessage(error));
      }
    });
    // Re-read after scheduling recovery (may already be failed if max attempts).
    job = (await getWorkJobDurable(id, userId)) ?? job;
  }

  const meta =
    job.metadata && typeof job.metadata === "object"
      ? (job.metadata as Record<string, unknown>)
      : {};
  const failureDiagnostic =
    meta.failureDiagnostic && typeof meta.failureDiagnostic === "object"
      ? (meta.failureDiagnostic as Record<string, unknown>)
      : null;

  return Response.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    error: job.error,
    visionGate: job.visionGate,
    result: job.result,
    completedAt: job.completedAt,
    // Owner/E2E diagnostics — no secrets; raw cause already truncated at write time.
    failureDiagnostic: failureDiagnostic
      ? {
          diagnosticId:
            typeof failureDiagnostic.diagnosticId === "string"
              ? failureDiagnostic.diagnosticId
              : null,
          failedStage:
            typeof failureDiagnostic.failedStage === "string"
              ? failureDiagnostic.failedStage
              : null,
          developerCode:
            typeof failureDiagnostic.developerCode === "string"
              ? failureDiagnostic.developerCode
              : null,
          failureClass:
            typeof failureDiagnostic.failureClass === "string"
              ? failureDiagnostic.failureClass
              : null,
          cause:
            typeof failureDiagnostic.cause === "string"
              ? failureDiagnostic.cause.slice(0, 500)
              : null,
          safeMessage:
            typeof failureDiagnostic.safeMessage === "string"
              ? failureDiagnostic.safeMessage.slice(0, 500)
              : null,
        }
      : null,
    diagnosticId:
      (typeof failureDiagnostic?.diagnosticId === "string"
        ? failureDiagnostic.diagnosticId
        : null) ??
      job.visionGate?.diagnosticId ??
      null,
    failedStage:
      (typeof failureDiagnostic?.failedStage === "string"
        ? failureDiagnostic.failedStage
        : null) ??
      job.visionGate?.failedStage ??
      null,
    developerCode:
      (typeof failureDiagnostic?.developerCode === "string"
        ? failureDiagnostic.developerCode
        : null) ??
      job.visionGate?.developerCode ??
      null,
    message:
      job.status === "queued" || job.status === "running"
        ? "依頼を受け付けました。バックグラウンドで処理しています。"
        : job.status === "completed"
          ? "すべて完了しました。"
          : job.status === "awaiting_confirmation"
            ? "確認が必要です。"
            : job.error ?? "確認が必要です。",
  });
}
