import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  executeWorkJob,
  isStaleWorkJobRunning,
} from "@/lib/work-jobs/run";
import {
  getWorkJobDurable,
  touchWorkJobDurableThrottled,
} from "@/lib/work-jobs/store";

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

  // Stale running must not stay 処理中 — reclaim on poll.
  if (job.status === "running" && isStaleWorkJobRunning(job)) {
    after(async () => {
      try {
        await executeWorkJob(id, userId);
      } catch (error) {
        console.warn("[work-jobs/poll]", toHumanReliabilityMessage(error));
      }
    });
    // Re-read after scheduling recovery (may already be failed if max attempts).
    job = (await getWorkJobDurable(id, userId)) ?? job;
  } else if (job.status === "running" || job.status === "queued") {
    // Keep durable updatedAt fresh so other instances do not false-reclaim.
    job = await touchWorkJobDurableThrottled(job);
  }

  return Response.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    error: job.error,
    visionGate: job.visionGate,
    result: job.result,
    completedAt: job.completedAt,
    commanderRunId:
      typeof job.metadata?.commanderRunId === "string"
        ? job.metadata.commanderRunId
        : (job.result as { commanderRunId?: string } | null)?.commanderRunId ??
          null,
    message:
      job.status === "queued" || job.status === "running"
        ? "依頼を受け付けました。完了したらお知らせに届きます。このまま待っても、ホームに戻っても大丈夫です。"
        : job.status === "completed"
          ? "すべて完了しました。"
          : job.status === "awaiting_confirmation"
            ? "内容の確認が必要です。画面の案内に沿って進めてください。"
            : job.error ?? "内容をご確認ください。もう一度お願いすることもできます。",
  });
}
