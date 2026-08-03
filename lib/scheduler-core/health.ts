import "server-only";

import { getSchedulerSecretConfigStatus } from "./auth";
import { getSchedulerCoreStore } from "./durable";
import { resolveSchedulerEnvironment } from "./env";
import { FORMAL_SCHEDULER_TICK_PATH } from "./types";

export type SchedulerHealthSnapshot = {
  configured: boolean;
  primarySecretConfigured: boolean;
  compatSecretConfigured: boolean;
  authenticatedRouteAvailable: boolean;
  formalPath: string;
  environment: string;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  dueCount: number | null;
  outboxPendingCount: number | null;
  oldestDueAgeMs: number | null;
  status: "ok" | "warn" | "down" | "misconfigured";
  diagnosticId: string;
};

export async function buildSchedulerHealthSnapshot(): Promise<SchedulerHealthSnapshot> {
  const secrets = getSchedulerSecretConfigStatus();
  const environment = resolveSchedulerEnvironment();
  const diagnosticId = `shealth_${Date.now().toString(36)}`;

  let lastTickAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let lastFailureAt: string | null = null;
  let dueCount: number | null = null;
  let outboxPendingCount: number | null = null;
  let oldestDueAgeMs: number | null = null;
  let storeOk = true;

  try {
    const store = getSchedulerCoreStore();
    const latest = await store.getLatestTick();
    lastTickAt = latest?.startedAt ?? null;
    if (latest?.status === "succeeded" || latest?.status === "partial") {
      lastSuccessAt = latest.completedAt ?? latest.startedAt;
    }
    if (latest?.status === "failed") {
      lastFailureAt = latest.completedAt ?? latest.startedAt;
    }
    outboxPendingCount = await store.countPendingOutbox();
    oldestDueAgeMs = await store.oldestDueAgeMs(environment, Date.now());
    const due = await store.listDueSchedules({
      environment,
      nowIso: new Date().toISOString(),
      limit: 1000,
    });
    dueCount = due.length;
  } catch {
    storeOk = false;
  }

  let status: SchedulerHealthSnapshot["status"] = "ok";
  if (!secrets.configured) status = "misconfigured";
  else if (!storeOk) status = "down";
  else if ((outboxPendingCount ?? 0) > 50 || (oldestDueAgeMs ?? 0) > 3600_000) {
    status = "warn";
  }

  return {
    configured: secrets.configured,
    primarySecretConfigured: secrets.primaryConfigured,
    compatSecretConfigured: secrets.compatConfigured,
    authenticatedRouteAvailable: true,
    formalPath: FORMAL_SCHEDULER_TICK_PATH,
    environment,
    lastTickAt,
    lastSuccessAt,
    lastFailureAt,
    dueCount,
    outboxPendingCount,
    oldestDueAgeMs,
    status,
    diagnosticId,
  };
}
