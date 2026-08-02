import {
  getSchedulerAliveState,
  listQueueDepthSamples,
} from "./history-store";
import { computeSchedulerMetrics } from "./metrics";
import { getSchedulerQueueSnapshot } from "./queue";
import type { SchedulerHealth } from "./types";

const SUCCESS_RATE_WARN = 0.95;
const ALIVE_STALE_MS = 2 * 60 * 60 * 1000;

export async function buildSchedulerHealth(options?: {
  nowMs?: number;
}): Promise<SchedulerHealth> {
  const nowMs = options?.nowMs ?? Date.now();
  const alive = getSchedulerAliveState();
  const metrics = computeSchedulerMetrics({ nowMs });
  const queue = await getSchedulerQueueSnapshot();

  const lastTickMs = alive.lastTickAt ? Date.parse(alive.lastTickAt) : NaN;
  const stale =
    !Number.isFinite(lastTickMs) || nowMs - lastTickMs > ALIVE_STALE_MS;
  const schedulerStopped = alive.stopped || stale || alive.tickCount === 0;
  const schedulerAlive = alive.alive && !schedulerStopped && alive.lastTickOk === true;

  let level: SchedulerHealth["level"] = "ok";
  let detail = "Scheduler 正常";

  if (schedulerStopped || !schedulerAlive) {
    level = "down";
    detail = alive.lastTickError ?? "Scheduler 停止または未稼働";
  } else if (
    metrics.successRate != null &&
    metrics.total >= 5 &&
    metrics.successRate < SUCCESS_RATE_WARN
  ) {
    level = "down";
    detail = `成功率が ${(metrics.successRate * 100).toFixed(1)}%（閾値 95%）`;
  } else if (queue.queueSize >= 50) {
    level = "warn";
    detail = `Queue 増加中（${queue.queueSize}）`;
  } else if (listQueueDepthSamples().length >= 3) {
    const samples = listQueueDepthSamples().slice(0, 5);
    const rising = samples.every(
      (v, i) => i === 0 || v >= (samples[i - 1] ?? v),
    );
    if (rising && (samples[0] ?? 0) >= 10) {
      level = "warn";
      detail = `Queue 増加トレンド（直近 ${samples[0]}）`;
    }
  }

  return {
    schedulerAlive,
    schedulerStopped,
    queueSize: queue.queueSize,
    runningJobs: queue.runningJobs,
    waitingJobs: queue.waitingJobs,
    failedJobs: queue.failedJobs,
    averageDelayMs: metrics.averageDelayMs,
    successRate: metrics.successRate,
    retryCount: metrics.retryCount,
    lastTickAt: alive.lastTickAt,
    level,
    detail,
    generatedAt: new Date(nowMs).toISOString(),
  };
}
