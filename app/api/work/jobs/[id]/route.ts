import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  appendJobEvent,
  readJobEvents,
  readProgressPhase,
  readTimeoutReason,
} from "@/lib/work-jobs/event-log";
import {
  isTerminalJobStatus,
  userMessageForJobError,
} from "@/lib/work-jobs/job-status";
import {
  JOB_ACCEPTED_DESCRIPTION,
  JOB_ACCEPTED_TITLE,
  JOB_SLOW_BANNER,
  computeJobElapsedMs,
  isJobTakingLonger,
  labelForProgressPhase,
  progressPhaseFromJobStatus,
} from "@/lib/work-jobs/progress";
import {
  executeWorkJob,
  isStaleWorkJobRunning,
} from "@/lib/work-jobs/run";
import { getWorkJobDurable } from "@/lib/work-jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function userMessageForJob(job: {
  status: string;
  blockReason: string | null;
  error: string | null;
  errorCode: string | null;
  isSlow: boolean;
}): string {
  if (job.status === "queued") {
    return `${JOB_ACCEPTED_TITLE}\n${JOB_ACCEPTED_DESCRIPTION}`;
  }
  if (job.status === "processing") {
    if (job.blockReason === "awaiting_confirmation") {
      return "確認が必要です。";
    }
    if (job.isSlow) return JOB_SLOW_BANNER;
    return "ご依頼を処理しています。完了すると通知でお知らせします。";
  }
  if (job.status === "completed") return "成果物が完成しました。";
  if (job.status === "cancelled") return "作業を中止しました。";
  if (job.status === "timed_out") {
    return userMessageForJobError("TIMEOUT", job.error);
  }
  if (job.status === "failed") {
    return (
      job.error ??
      userMessageForJobError(
        (job.errorCode as "UNKNOWN_ERROR" | null) ?? "UNKNOWN_ERROR",
      )
    );
  }
  return job.error ?? "確認が必要です。";
}

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

  // Stale processing must not stay 処理中 — reclaim on poll.
  if (
    job.status === "processing" &&
    job.blockReason == null &&
    isStaleWorkJobRunning(job)
  ) {
    after(async () => {
      try {
        await executeWorkJob(id, userId);
      } catch (error) {
        console.warn("[work-jobs/poll]", toHumanReliabilityMessage(error));
      }
    });
    job = (await getWorkJobDurable(id, userId)) ?? job;
  }

  const elapsedMs = computeJobElapsedMs({
    createdAt: job.createdAt,
    startedAt: job.startedAt,
  });
  const isSlow = isJobTakingLonger({
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
  });
  const progressPhase = progressPhaseFromJobStatus(
    job.status,
    readProgressPhase(job),
  );
  const events = readJobEvents(job);
  const timeoutReason = readTimeoutReason(job);

  return Response.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    blockReason: job.blockReason,
    error: job.error,
    errorCode: job.errorCode,
    result: job.result,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    terminal: isTerminalJobStatus(job.status),
    progressPhase,
    progressLabel: labelForProgressPhase(progressPhase),
    elapsedMs,
    isSlow,
    timeoutReason,
    events,
    message: userMessageForJob({
      status: job.status,
      blockReason: job.blockReason,
      error: job.error,
      errorCode: job.errorCode,
      isSlow,
    }),
  });
}
