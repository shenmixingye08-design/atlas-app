/**
 * Configurable lease / stuck thresholds.
 * Defaults stay short enough not to hide production failures.
 */

import {
  WORK_QUEUE_HEARTBEAT_MS,
  WORK_QUEUE_LEASE_MS,
  WORK_QUEUE_STUCK_MS,
} from "@/lib/work-queue/constants";

const MIN_STUCK_MS = 5_000;
const MAX_STUCK_MS = 10 * 60_000; // 10 minutes — do not hide stuck jobs longer
const MIN_LEASE_MS = 5_000;
const MAX_LEASE_MS = 5 * 60_000;
const MIN_HEARTBEAT_MS = 1_000;
const MAX_HEARTBEAT_MS = 60_000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readMs(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveLeaseMs(): number {
  return clamp(
    readMs("ATLAS_DURABLE_LEASE_MS", WORK_QUEUE_LEASE_MS),
    MIN_LEASE_MS,
    MAX_LEASE_MS,
  );
}

export function resolveHeartbeatMs(): number {
  return clamp(
    readMs("ATLAS_DURABLE_HEARTBEAT_MS", WORK_QUEUE_HEARTBEAT_MS),
    MIN_HEARTBEAT_MS,
    MAX_HEARTBEAT_MS,
  );
}

/** Stuck when heartbeat older than this while leased/running. */
export function resolveStuckThresholdMs(): number {
  return clamp(
    readMs("ATLAS_DURABLE_STUCK_MS", WORK_QUEUE_STUCK_MS),
    MIN_STUCK_MS,
    MAX_STUCK_MS,
  );
}

/** On graceful shutdown, shorten remaining lease to this window. */
export function resolveShutdownLeaseGraceMs(): number {
  return clamp(
    readMs("ATLAS_DURABLE_SHUTDOWN_LEASE_GRACE_MS", 5_000),
    1_000,
    30_000,
  );
}
