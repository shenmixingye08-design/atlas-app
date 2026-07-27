import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";
import {
  recoverStaleWorkJobs,
  resumeDueWorkJobs,
} from "@/lib/work-jobs/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Resume queued / hung work jobs for the current user.
 * Called on app focus / notification panel open so browser refresh,
 * disconnect, or tab close does not leave work stuck.
 */
export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "確認が必要です。もう一度ログインしてください。" },
      { status: 401 },
    );
  }

  const stale = recoverStaleWorkJobs(userId);

  after(async () => {
    try {
      await resumeDueWorkJobs(userId);
    } catch (error) {
      console.warn("[work-jobs/recover]", toHumanReliabilityMessage(error));
    }
  });

  return Response.json({
    ok: true,
    recovered: stale.recovered,
    jobIds: stale.jobs.map((job) => job.id),
    message:
      stale.recovered > 0
        ? `${stale.recovered}件の仕事を自動復旧しました。`
        : "停止中の仕事はありません。",
  });
}
