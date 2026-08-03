import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  executeWorkJob,
  isStaleWorkJobRunning,
} from "@/lib/work-jobs/run";
import { buildWorkJobPublicView } from "@/lib/work-jobs/production/progress";
import {
  getWorkJobDurable,
  isWorkJobInProgressStatus,
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

  // Stale in-progress must not stay 処理中 — reclaim on poll.
  if (isWorkJobInProgressStatus(job.status) && isStaleWorkJobRunning(job)) {
    after(async () => {
      try {
        await executeWorkJob(id, userId);
      } catch (error) {
        console.warn("[work-jobs/poll]", toHumanReliabilityMessage(error));
      }
    });
    job = (await getWorkJobDurable(id, userId)) ?? job;
  }

  const view = buildWorkJobPublicView(job);

  return Response.json({
    ok: true,
    ...view,
    visionGate: job.visionGate,
    result: job.result,
    completedAt: job.completedAt,
  });
}
