import { auth } from "@clerk/nextjs/server";

import { getWorkJobDurable } from "@/lib/work-jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const job = await getWorkJobDurable(id, userId);
  if (!job) {
    return Response.json(
      { error: "依頼が見つかりません。もう一度送ってください。" },
      { status: 404 },
    );
  }

  return Response.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    error: job.error,
    result: job.result,
    fileDeliverables: job.fileDeliverables ?? [],
    fileDeliverableFailures: job.fileDeliverableFailures ?? [],
    fileDeliverableStatus: job.fileDeliverableStatus,
    fileDeliverableMatchedRule: job.fileDeliverableMatchedRule,
    completedAt: job.completedAt,
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
