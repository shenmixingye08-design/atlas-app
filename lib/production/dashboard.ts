import "server-only";

import { listDrQueueJobs } from "@/lib/owner/disaster-recovery/store";
import { getCronTickState } from "@/lib/owner/monitoring/store";
import { getReliabilityMetricsSnapshot } from "@/lib/reliability/metrics";

import { getProductAnalyticsSnapshot } from "./analytics";
import { getConfiguredAlertChannels } from "./alerts";
import { getBackupReadinessSnapshot } from "./backup-catalog";
import { getProductionCostSnapshot } from "./cost";
import { getProductionHealthSnapshot } from "./health";
import {
  getLatencyPercentiles,
  getProductionCounters,
  sampleProcessGauges,
  setProductionGaugeCounter,
} from "./metrics";
import { runProductionMonitors } from "./monitors";
import { getRateLimitScopeConfig } from "./rate-limit-scopes";
import { getProductionSecuritySnapshot } from "./security";

export type ProductionOpsDashboard = {
  health: Awaited<ReturnType<typeof getProductionHealthSnapshot>>;
  gauges: ReturnType<typeof sampleProcessGauges>;
  counters: ReturnType<typeof getProductionCounters>;
  latency: ReturnType<typeof getLatencyPercentiles>;
  queue: {
    queued: number;
    retrying: number;
    dead: number;
    succeeded: number;
  };
  cron: ReturnType<typeof getCronTickState>;
  monitors: Awaited<ReturnType<typeof runProductionMonitors>>;
  analytics: ReturnType<typeof getProductAnalyticsSnapshot>;
  cost: ReturnType<typeof getProductionCostSnapshot>;
  security: ReturnType<typeof getProductionSecuritySnapshot>;
  backup: ReturnType<typeof getBackupReadinessSnapshot>;
  alertChannels: string[];
  rateLimits: ReturnType<typeof getRateLimitScopeConfig>;
  reliabilityStartedAt: string;
  platform: {
    targetConcurrentUsers: 1000;
    runtime: "vercel-nodejs";
    note: string;
  };
  generatedAt: string;
};

export async function getProductionOpsDashboard(): Promise<ProductionOpsDashboard> {
  const jobs = listDrQueueJobs();
  const queued = jobs.filter((j) => j.status === "queued").length;
  const retrying = jobs.filter((j) => j.status === "retrying").length;
  setProductionGaugeCounter("queueDepth", queued + retrying);
  setProductionGaugeCounter(
    "workerRunning",
    jobs.filter((j) => j.status === "retrying").length,
  );

  const [health, monitors] = await Promise.all([
    getProductionHealthSnapshot(),
    runProductionMonitors(),
  ]);

  const reliability = getReliabilityMetricsSnapshot();

  return {
    health,
    gauges: sampleProcessGauges(),
    counters: getProductionCounters(),
    latency: getLatencyPercentiles(),
    queue: {
      queued,
      retrying,
      dead: jobs.filter((j) => j.status === "dead").length,
      succeeded: jobs.filter((j) => j.status === "succeeded").length,
    },
    cron: getCronTickState(),
    monitors,
    analytics: getProductAnalyticsSnapshot(),
    cost: getProductionCostSnapshot(),
    security: getProductionSecuritySnapshot(),
    backup: getBackupReadinessSnapshot(),
    alertChannels: getConfiguredAlertChannels(),
    rateLimits: getRateLimitScopeConfig(),
    reliabilityStartedAt: reliability.startedAt,
    platform: {
      targetConcurrentUsers: 1000,
      runtime: "vercel-nodejs",
      note: "In-process metrics + DR queue; multi-instance Redis limiter is the next hardening step.",
    },
    generatedAt: new Date().toISOString(),
  };
}
