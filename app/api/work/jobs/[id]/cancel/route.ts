import { auth } from "@clerk/nextjs/server";

import { cancelWorkJob } from "@/lib/work-jobs/cancel";
import { buildWorkJobPublicView } from "@/lib/work-jobs/production/progress";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Cancel a non-terminal work job. */
export async function POST(
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
  try {
    const job = await cancelWorkJob(id, userId);
    return Response.json({
      ok: true,
      ...buildWorkJobPublicView(job),
    });
  } catch (error) {
    const message = toHumanReliabilityMessage(error);
    const code = error instanceof Error ? error.message : "cancel_failed";
    const status =
      code === "job_not_found" ? 404 : code === "job_already_terminal" ? 409 : 400;
    return Response.json({ ok: false, error: message, code }, { status });
  }
}
