import "server-only";

import { listDrQueueJobs } from "@/lib/owner/disaster-recovery/store";
import { getCronTickState } from "@/lib/owner/monitoring/store";
import { getReliabilityMetricsSnapshot } from "@/lib/reliability/metrics";
import { getCircuitBreakerSnapshot } from "@/lib/reliability/circuit-breaker";

import { dispatchProductionAlert } from "./alerts";
import {
  getProductionCounters,
  sampleProcessGauges,
  setProductionGaugeCounter,
} from "./metrics";
import { structuredLog } from "./structured-log";

export type MonitorCheckId =
  | "queue_backlog"
  | "worker_pressure"
  | "failure_spike"
  | "retry_spike"
  | "storage_fault"
  | "openai_fault"
  | "db_fault"
  | "notification_fault"
  | "scheduler_stop";

export type MonitorCheckResult = {
  id: MonitorCheckId;
  ok: boolean;
  level: "ok" | "warn" | "critical";
  detail: string;
};

/**
 * Minimum production monitors required for 1000-user ops.
 * Emits alerts on critical; never spam (alert cooldown).
 */
export async function runProductionMonitors(): Promise<MonitorCheckResult[]> {
  const jobs = listDrQueueJobs();
  const queued = jobs.filter(
    (j) => j.status === "queued" || j.status === "retrying",
  ).length;
  const dead = jobs.filter((j) => j.status === "dead").length;
  setProductionGaugeCounter("queueDepth", queued);

  const gauges = sampleProcessGauges();
  const counters = getProductionCounters();
  const reliability = getReliabilityMetricsSnapshot();
  const circuits = getCircuitBreakerSnapshot();
  const cron = getCronTickState();

  const failureTotal = Object.values(reliability.buckets).reduce(
    (sum, b) => sum + b.failure,
    0,
  );
  const retryTotal = Object.values(reliability.buckets).reduce(
    (sum, b) => sum + b.retry,
    0,
  );

  const openaiOpen = circuits.openai?.state === "open";

  const results: MonitorCheckResult[] = [
    {
      id: "queue_backlog",
      ok: queued < 50 && dead < 10,
      level: dead >= 10 || queued >= 100 ? "critical" : queued >= 50 ? "warn" : "ok",
      detail: `queued=${queued} dead=${dead}`,
    },
    {
      id: "worker_pressure",
      ok: gauges.memoryUsagePercent < 90,
      level:
        gauges.memoryUsagePercent >= 95
          ? "critical"
          : gauges.memoryUsagePercent >= 85
            ? "warn"
            : "ok",
      detail: `memory=${gauges.memoryUsagePercent}% lag=${gauges.eventLoopLagMs ?? 0}ms`,
    },
    {
      id: "failure_spike",
      ok: failureTotal < 50,
      level: failureTotal >= 100 ? "critical" : failureTotal >= 50 ? "warn" : "ok",
      detail: `failures=${failureTotal}`,
    },
    {
      id: "retry_spike",
      ok: retryTotal < 80,
      level: retryTotal >= 150 ? "critical" : retryTotal >= 80 ? "warn" : "ok",
      detail: `retries=${retryTotal}`,
    },
    {
      id: "storage_fault",
      ok: counters.storageErrors < 10,
      level:
        counters.storageErrors >= 25
          ? "critical"
          : counters.storageErrors >= 10
            ? "warn"
            : "ok",
      detail: `storageErrors=${counters.storageErrors}`,
    },
    {
      id: "openai_fault",
      ok: !openaiOpen && counters.openaiErrors < 20,
      level: openaiOpen || counters.openaiErrors >= 40 ? "critical" : counters.openaiErrors >= 20 ? "warn" : "ok",
      detail: openaiOpen
        ? "circuit open"
        : `openaiErrors=${counters.openaiErrors}`,
    },
    {
      id: "db_fault",
      ok: counters.dbErrors < 10,
      level:
        counters.dbErrors >= 25
          ? "critical"
          : counters.dbErrors >= 10
            ? "warn"
            : "ok",
      detail: `dbErrors=${counters.dbErrors}`,
    },
    {
      id: "notification_fault",
      ok: counters.notificationFailures < 15,
      level:
        counters.notificationFailures >= 40
          ? "critical"
          : counters.notificationFailures >= 15
            ? "warn"
            : "ok",
      detail: `notificationFailures=${counters.notificationFailures}`,
    },
    {
      id: "scheduler_stop",
      ok: Boolean(cron.lastSuccessAt),
      level: (() => {
        if (!cron.lastSuccessAt && cron.lastFailureAt) return "critical";
        if (!cron.lastSuccessAt) return "warn";
        const ageH =
          (Date.now() - new Date(cron.lastSuccessAt).getTime()) / 3_600_000;
        if (ageH > 36) return "critical";
        if (ageH > 26) return "warn";
        return "ok";
      })(),
      detail: cron.lastSuccessAt
        ? `lastSuccess=${cron.lastSuccessAt}`
        : "no successful tick",
    },
  ];

  for (const result of results) {
    if (result.level === "ok") continue;
    structuredLog(result.level === "critical" ? "error" : "warn", result.detail, {
      event: "production_monitor",
      service: "production",
      meta: { id: result.id, level: result.level },
    });
    if (result.level === "critical") {
      await dispatchProductionAlert({
        title: `Monitor: ${result.id}`,
        message: result.detail,
        severity: "critical",
        kind: `monitor_${result.id}`,
      });
    }
  }

  return results;
}
