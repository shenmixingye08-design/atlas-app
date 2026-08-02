import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  buildSchedulerHealth,
  buildSchedulerProofSummary,
  computeSchedulerMetrics,
  evaluateSchedulerAlerts,
  getSchedulerAliveState,
  getSchedulerQueueSnapshot,
  listSchedulerHistory,
} from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner Scheduler History / Metrics / Health / Alerts dashboard API. */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();

  const url = new URL(request.url);
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100),
  );

  const [health, queue, alerts] = await Promise.all([
    buildSchedulerHealth(),
    getSchedulerQueueSnapshot(),
    evaluateSchedulerAlerts({ emitIncidents: false }),
  ]);

  return Response.json({
    health,
    metrics: computeSchedulerMetrics(),
    alive: getSchedulerAliveState(),
    queue,
    alerts,
    history: listSchedulerHistory(limit),
    proof: buildSchedulerProofSummary(limit),
    generatedAt: new Date().toISOString(),
  });
}
