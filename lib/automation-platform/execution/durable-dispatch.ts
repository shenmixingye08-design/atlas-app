import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import {
  memoryGetRun,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import type { AutomationRun } from "@/lib/automation-platform/types";

/**
 * DB-backed dispatch leases (atlas_user_state).
 *
 * Constraint: This environment has no separate queue broker (Redis/SQS).
 * Persistence uses the same durable domain model as runs. Leases survive
 * worker restarts; stuck leases are reclaimed after expiration.
 */

export const AUTOMATION_DISPATCH_DOMAIN_KEY = "atlasAutomationDispatchV2";

export const DEFAULT_LEASE_TTL_MS = 90_000;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;

export type DispatchLeaseRecord = {
  runId: string;
  userId: string;
  workerId: string;
  leasedAt: string;
  heartbeatAt: string;
  expiresAt: string;
  status: "leased" | "completed" | "dead_letter" | "released";
  retryCount: number;
  lastError: string | null;
};

type DurableDispatchState = {
  leases: DispatchLeaseRecord[];
};

type MemoryLeaseBucket = Map<string, DispatchLeaseRecord>;

function getMemory(): MemoryLeaseBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationDispatchLeasesV2?: MemoryLeaseBucket;
  };
  if (!globalScope.__atlasAutomationDispatchLeasesV2) {
    globalScope.__atlasAutomationDispatchLeasesV2 = new Map();
  }
  return globalScope.__atlasAutomationDispatchLeasesV2;
}

function compact(state: DurableDispatchState): DurableDispatchState {
  const sorted = [...state.leases].sort(
    (a, b) => Date.parse(b.leasedAt) - Date.parse(a.leasedAt),
  );
  return { leases: sorted.slice(0, 2000) };
}

export function resetAutomationDispatchForTests(): void {
  getMemory().clear();
}

async function persistUserLeases(userId: string): Promise<void> {
  const mem = getMemory();
  const leases = [...mem.values()].filter((row) => row.userId === userId);
  void persistDurableDomain(
    userId,
    AUTOMATION_DISPATCH_DOMAIN_KEY,
    { leases } satisfies DurableDispatchState,
    { compact, forceSupabase: true },
  );
}

export async function ensureDispatchHydrated(userId: string): Promise<void> {
  const mem = getMemory();
  const hasUser = [...mem.values()].some((row) => row.userId === userId);
  if (hasUser) return;
  const loaded = await loadDurableDomain<DurableDispatchState>(
    userId,
    AUTOMATION_DISPATCH_DOMAIN_KEY,
  );
  if (!loaded?.leases) return;
  for (const row of loaded.leases) {
    if (row?.runId) mem.set(row.runId, row);
  }
}

export async function acquireDispatchLease(input: {
  run: AutomationRun;
  workerId: string;
  ttlMs?: number;
}): Promise<DispatchLeaseRecord | null> {
  await ensureDispatchHydrated(input.run.userId);
  const mem = getMemory();
  const existing = mem.get(input.run.id);
  const now = Date.now();
  if (
    existing &&
    existing.status === "leased" &&
    Date.parse(existing.expiresAt) > now &&
    existing.workerId !== input.workerId
  ) {
    return null;
  }

  const leasedAt = new Date(now).toISOString();
  const ttl = input.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const record: DispatchLeaseRecord = {
    runId: input.run.id,
    userId: input.run.userId,
    workerId: input.workerId,
    leasedAt,
    heartbeatAt: leasedAt,
    expiresAt: new Date(now + ttl).toISOString(),
    status: "leased",
    retryCount: existing?.retryCount ?? 0,
    lastError: null,
  };
  mem.set(input.run.id, record);
  await persistUserLeases(input.run.userId);
  return record;
}

export async function heartbeatDispatchLease(input: {
  runId: string;
  userId: string;
  workerId: string;
  ttlMs?: number;
}): Promise<DispatchLeaseRecord | null> {
  await ensureDispatchHydrated(input.userId);
  const mem = getMemory();
  const current = mem.get(input.runId);
  if (!current || current.status !== "leased") return null;
  if (current.workerId !== input.workerId) return null;
  const now = Date.now();
  const ttl = input.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const next: DispatchLeaseRecord = {
    ...current,
    heartbeatAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };
  mem.set(input.runId, next);
  await persistUserLeases(input.userId);
  return next;
}

export async function completeDispatchLease(input: {
  runId: string;
  userId: string;
  workerId: string;
}): Promise<void> {
  await ensureDispatchHydrated(input.userId);
  const mem = getMemory();
  const current = mem.get(input.runId);
  if (!current) return;
  if (current.workerId !== input.workerId) return;
  mem.set(input.runId, {
    ...current,
    status: "completed",
    heartbeatAt: new Date().toISOString(),
  });
  await persistUserLeases(input.userId);
}

export async function deadLetterDispatchLease(input: {
  runId: string;
  userId: string;
  workerId: string;
  error: string;
}): Promise<void> {
  await ensureDispatchHydrated(input.userId);
  const mem = getMemory();
  const current = mem.get(input.runId);
  if (!current) return;
  mem.set(input.runId, {
    ...current,
    status: "dead_letter",
    lastError: input.error.slice(0, 500),
    retryCount: current.retryCount + 1,
    heartbeatAt: new Date().toISOString(),
  });
  await persistUserLeases(input.userId);
}

/**
 * Reclaim stuck running runs whose lease expired (worker crash / deploy interrupt).
 * Returns run ids reset to queued/retrying for re-dispatch.
 */
export async function reclaimStuckDispatchLeases(input: {
  userId: string;
  nowMs?: number;
}): Promise<string[]> {
  await ensureDispatchHydrated(input.userId);
  const mem = getMemory();
  const now = input.nowMs ?? Date.now();
  const reclaimed: string[] = [];

  for (const lease of [...mem.values()]) {
    if (lease.userId !== input.userId) continue;
    if (lease.status !== "leased") continue;
    if (Date.parse(lease.expiresAt) > now) continue;

    const run = memoryGetRun(lease.runId);
    if (run && run.status === "running") {
      const nextStatus = run.attemptCount > 0 ? "retrying" : "queued";
      persistAutomationRunNow(
        memoryUpdateRun({
          ...run,
          status: nextStatus,
          nextRetryAt: nextStatus === "retrying" ? new Date(now).toISOString() : null,
          updatedAt: new Date(now).toISOString(),
          lastErrorCode: "automation_worker_lease_expired",
          lastErrorMessage: "Worker lease expired — reclaimed for retry",
          retryable: true,
        }),
      );
      reclaimed.push(run.id);
    }

    mem.set(lease.runId, {
      ...lease,
      status: "released",
      lastError: "lease_expired_reclaimed",
      heartbeatAt: new Date(now).toISOString(),
    });
  }

  await persistUserLeases(input.userId);
  return reclaimed;
}

export function getDispatchLease(runId: string): DispatchLeaseRecord | null {
  return getMemory().get(runId) ?? null;
}
