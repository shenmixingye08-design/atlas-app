import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import { cancelWorkJob } from "@/lib/work-queue/control";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

/**
 * Cancel a durable work-queue job.
 * Auth: CRON_SECRET bearer or ATLAS owner session.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const { jobId } = await context.params;
  if (!jobId?.trim()) {
    return Response.json({ error: "jobId required" }, { status: 400 });
  }

  const cancelled = await cancelWorkJob(jobId);
  if (!cancelled) {
    return Response.json(
      { ok: false, error: "job not cancellable or missing" },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, jobId, status: "cancelled" });
}
