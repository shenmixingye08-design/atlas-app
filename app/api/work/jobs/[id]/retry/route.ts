import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import { executeWorkJob } from "@/lib/work-jobs/run";
import { retryWorkJob } from "@/lib/work-jobs/recovery";
import { getWorkJobDurable, saveWorkJob } from "@/lib/work-jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manually re-run a failed work job (notification「再実行」).
 * Continues in the background — browser may disconnect.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "確認が必要です。もう一度ログインしてください。" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const existing = await getWorkJobDurable(id, userId);
  if (!existing) {
    return Response.json({ error: "仕事が見つかりませんでした。" }, { status: 404 });
  }

  if (existing.status === "completed") {
    return Response.json({
      ok: true,
      jobId: existing.id,
      status: existing.status,
      message: "すでに完了しています。",
    });
  }

  if (existing.status === "running") {
    return Response.json({
      ok: true,
      jobId: existing.id,
      status: existing.status,
      message: "現在処理中です。完了までお待ちください。",
    });
  }

  // Reset to queued so executeWorkJob will pick it up.
  saveWorkJob({
    ...existing,
    status: "queued",
    error: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
  });

  after(async () => {
    try {
      await retryWorkJob(id, userId);
    } catch (error) {
      console.warn("[work-jobs/retry]", toHumanReliabilityMessage(error));
      try {
        await executeWorkJob(id, userId);
      } catch (inner) {
        console.warn("[work-jobs/retry-fallback]", toHumanReliabilityMessage(inner));
      }
    }
  });

  return Response.json(
    {
      ok: true,
      jobId: id,
      status: "queued",
      message: "再実行を開始しました。バックグラウンドで処理しています。",
    },
    { status: 202 },
  );
}
