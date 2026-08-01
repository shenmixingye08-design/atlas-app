import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  executeWorkJob,
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

  // Stale active vision/work phases must not stay 処理中 — reclaim on poll.
  if (isStaleWorkJobRunning(job)) {
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

  const visionPhase =
    typeof job.metadata?.visionPhase === "string"
      ? job.metadata.visionPhase
      : job.status;

  return Response.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    error: job.error,
    visionGate: job.visionGate,
    result: job.result,
    completedAt: job.completedAt,
    metadata: {
      visionPhase,
      visionAttempt:
        typeof job.metadata?.visionAttempt === "number"
          ? job.metadata.visionAttempt
          : null,
      parentJobId:
        typeof job.metadata?.parentJobId === "string"
          ? job.metadata.parentJobId
          : null,
    },
    message:
      job.status === "queued" ||
      job.status === "running" ||
      job.status === "preprocessing" ||
      job.status === "analyzing" ||
      job.status === "retrying"
        ? "依頼を受け付けました。バックグラウンドで処理しています。"
        : job.status === "completed"
          ? "すべて完了しました。"
          : job.status === "needs_input"
            ? "画像は読み取れましたが、必要な項目を確認できませんでした。"
            : job.status === "awaiting_confirmation"
              ? "確認が必要です。"
              : job.error ?? "確認が必要です。",
  });
}
