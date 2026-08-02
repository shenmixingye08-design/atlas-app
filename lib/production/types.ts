export type ProductionHealthLevel = "ok" | "degraded" | "down";

export type ProductionOpsDashboardView = {
  health: {
    live: boolean;
    ready: boolean;
    status: ProductionHealthLevel;
    components: Array<{
      id: string;
      status: ProductionHealthLevel;
      detail: string;
      checkedAt: string;
    }>;
    checkedAt: string;
  };
  gauges: {
    cpuLoad1m: number | null;
    memoryUsedMb: number;
    memoryTotalMb: number;
    memoryUsagePercent: number;
    heapUsedMb: number;
    uptimeSec: number;
    eventLoopLagMs: number | null;
  };
  counters: {
    requests: number;
    failures: number;
    retries: number;
    queueDepth: number;
    workerRunning: number;
    storageErrors: number;
    openaiErrors: number;
    dbErrors: number;
    notificationFailures: number;
    schedulerStops: number;
  };
  latency:
    | Array<{
        name: string;
        count: number;
        p50: number | null;
        p95: number | null;
        p99: number | null;
        avg: number | null;
      }>
    | {
        name: string;
        count: number;
        p50: number | null;
        p95: number | null;
        p99: number | null;
        avg: number | null;
      };
  queue: {
    queued: number;
    retrying: number;
    dead: number;
    succeeded: number;
  };
  monitors: Array<{
    id: string;
    ok: boolean;
    level: "ok" | "warn" | "critical";
    detail: string;
  }>;
  analytics: {
    dau: number;
    wau: number;
    mau: number;
    activationCompletions: number;
    automationUtilizationPercent: number;
    deliverableUtilizationPercent: number;
    memoryUtilizationPercent: number;
    isEstimated: boolean;
  };
  cost: {
    openaiUsd: number;
    storageUsd: number;
    bandwidthUsd: number;
    automationUsd: number;
    totalUsd: number;
    costPerUserUsd: number | null;
  };
  security: {
    leastPrivilegeOwnerGate: boolean;
    tokenEncryptionAvailable: boolean;
    recommendations: string[];
  };
  backup: {
    domains: Array<{ id: string; label: string; status: string }>;
  };
  alertChannels: string[];
  generatedAt: string;
};
