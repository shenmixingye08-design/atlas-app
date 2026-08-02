import {
  buildSchedulerHealth,
  computeSchedulerMetrics,
  evaluateSchedulerAlerts,
  getSchedulerAliveState,
  getSchedulerQueueSnapshot,
  listSchedulerHistory,
} from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduler Health API
 * Scheduler Alive / Queue Size / Running / Waiting / Failed /
 * Average Delay / Success Rate / Retry Count
 */
export async function GET(): Promise<Response> {
  const [health, queue, alerts] = await Promise.all([
    buildSchedulerHealth(),
    getSchedulerQueueSnapshot(),
    evaluateSchedulerAlerts({ emitIncidents: false }),
  ]);
  const metrics = computeSchedulerMetrics();
  const alive = getSchedulerAliveState();
  const recent = listSchedulerHistory(20);

  const payload = {
    ok: health.level !== "down",
    schedulerAlive: health.schedulerAlive,
    queueSize: health.queueSize,
    runningJobs: health.runningJobs,
    waitingJobs: health.waitingJobs,
    failedJobs: health.failedJobs,
    averageDelay: health.averageDelayMs,
    successRate: health.successRate,
    retryCount: health.retryCount,
    health,
    metrics,
    alive,
    queue,
    alerts,
    recentHistory: recent,
    generatedAt: new Date().toISOString(),
  };

  return Response.json(payload, {
    status: health.level === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
