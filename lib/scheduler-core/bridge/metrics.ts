import "server-only";

import { getWorkQueueStore } from "@/lib/work-queue/store";

import { getSchedulerCoreStore } from "../durable";

import type {
  BridgeMetricsSnapshot,
  SchedulerBridgeHealth,
  SchedulerBridgeMetricsSnapshot,
} from "./types";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Process-local latency samples for the current instance.
 * Counts of queue depth come from durable stores at snapshot time.
 */
class BridgeMetricsBucket {
  enqueueLatencies: number[] = [];
  dispatchLatencies: number[] = [];
  queueWaits: number[] = [];
  leaseWaits: number[] = [];
  enqueueCount = 0;
  duplicateEnqueueCount = 0;
  failedEnqueueCount = 0;
  retryEnqueueCount = 0;
  dispatchedCount = 0;
  leaseStartedCount = 0;

  recordEnqueue(latencyMs: number, result: "created" | "duplicate" | "failed") {
    this.enqueueCount += 1;
    this.enqueueLatencies.push(latencyMs);
    if (result === "duplicate") this.duplicateEnqueueCount += 1;
    if (result === "failed") this.failedEnqueueCount += 1;
  }

  recordDispatch(latencyMs: number) {
    this.dispatchedCount += 1;
    this.dispatchLatencies.push(latencyMs);
  }

  recordRetry() {
    this.retryEnqueueCount += 1;
  }

  recordLease(waitMs: number) {
    this.leaseStartedCount += 1;
    this.leaseWaits.push(waitMs);
  }

  recordQueueWait(waitMs: number) {
    this.queueWaits.push(waitMs);
  }

  resetForTests() {
    this.enqueueLatencies = [];
    this.dispatchLatencies = [];
    this.queueWaits = [];
    this.leaseWaits = [];
    this.enqueueCount = 0;
    this.duplicateEnqueueCount = 0;
    this.failedEnqueueCount = 0;
    this.retryEnqueueCount = 0;
    this.dispatchedCount = 0;
    this.leaseStartedCount = 0;
  }
}

const globalKey = "__atlas_scheduler_bridge_metrics__";

function bucket(): BridgeMetricsBucket {
  const g = globalThis as unknown as Record<string, BridgeMetricsBucket>;
  if (!g[globalKey]) g[globalKey] = new BridgeMetricsBucket();
  return g[globalKey]!;
}

export function recordBridgeEnqueue(
  latencyMs: number,
  result: "created" | "duplicate" | "failed",
): void {
  bucket().recordEnqueue(latencyMs, result);
}

export function recordBridgeDispatch(latencyMs: number): void {
  bucket().recordDispatch(latencyMs);
}

export function recordBridgeRetry(): void {
  bucket().recordRetry();
}

export function recordBridgeLease(waitMs: number): void {
  bucket().recordLease(waitMs);
}

export function recordBridgeQueueWait(waitMs: number): void {
  bucket().recordQueueWait(waitMs);
}

export function resetBridgeMetricsForTests(): void {
  bucket().resetForTests();
}

export function resetSchedulerBridgeMetricsForTests(): void {
  resetBridgeMetricsForTests();
}

export function getBridgeMetricsCounters(): Omit<
  BridgeMetricsSnapshot,
  | "outboxPendingCount"
  | "queueLength"
  | "oldestJobAgeMs"
  | "retryQueueLength"
  | "deadLetterLength"
  | "runningCount"
  | "waitingCount"
  | "leasedCount"
> {
  const b = bucket();
  const enq = [...b.enqueueLatencies].sort((a, c) => a - c);
  const dis = [...b.dispatchLatencies].sort((a, c) => a - c);
  return {
    enqueueCount: b.enqueueCount,
    duplicateEnqueueCount: b.duplicateEnqueueCount,
    failedEnqueueCount: b.failedEnqueueCount,
    retryEnqueueCount: b.retryEnqueueCount,
    dispatchedCount: b.dispatchedCount,
    leaseStartedCount: b.leaseStartedCount,
    averageEnqueueLatencyMs: average(enq),
    averageDispatchLatencyMs: average(dis),
    averageQueueWaitMs: average(b.queueWaits),
    averageLeaseWaitMs: average(b.leaseWaits),
    p95EnqueueLatencyMs: percentile(enq, 95),
  };
}

export async function getSchedulerBridgeMetricsSnapshot(): Promise<SchedulerBridgeMetricsSnapshot> {
  const counters = getBridgeMetricsCounters();
  let outboxPendingCount = 0;
  let queueLength = 0;
  let oldestJobAgeMs: number | null = null;
  let retryQueueLength = 0;
  let deadLetterLength = 0;
  let runningCount = 0;
  let waitingCount = 0;
  let leasedCount = 0;

  try {
    outboxPendingCount = await getSchedulerCoreStore().countPendingOutbox();
  } catch {
    outboxPendingCount = -1;
  }

  try {
    const metrics = await getWorkQueueStore().metrics();
    queueLength = metrics.queued;
    waitingCount = metrics.waiting ?? metrics.queued;
    oldestJobAgeMs = metrics.oldestQueuedAgeMs;
    retryQueueLength = metrics.retryScheduled;
    deadLetterLength = metrics.deadLetter;
    runningCount = metrics.running;
    leasedCount = metrics.leased;
  } catch {
    queueLength = -1;
  }

  return {
    ...counters,
    outboxPendingCount,
    queueLength,
    oldestJobAgeMs,
    retryQueueLength,
    deadLetterLength,
    runningCount,
    waitingCount,
    leasedCount,
  };
}

export async function getSchedulerBridgeHealth(): Promise<SchedulerBridgeHealth> {
  const snapshot = await getSchedulerBridgeMetricsSnapshot();
  const dispatcherDisabled =
    process.env.SCHEDULER_BRIDGE_DISPATCHER_DISABLED?.trim().toLowerCase() ===
    "true";
  const queueDisabled =
    process.env.SCHEDULER_BRIDGE_QUEUE_DISABLED?.trim().toLowerCase() ===
    "true";

  let status: SchedulerBridgeHealth["status"] = "ok";
  if (snapshot.queueLength < 0 || snapshot.outboxPendingCount < 0) {
    status = "down";
  } else if (
    dispatcherDisabled ||
    queueDisabled ||
    snapshot.outboxPendingCount > 50 ||
    (snapshot.oldestJobAgeMs ?? 0) > 3600_000 ||
    snapshot.deadLetterLength > 0
  ) {
    status = "warn";
  }

  return {
    ...snapshot,
    status,
    dispatcherDisabled,
    queueDisabled,
    generatedAt: new Date().toISOString(),
  };
}
