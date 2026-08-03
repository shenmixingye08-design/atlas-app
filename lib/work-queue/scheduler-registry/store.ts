import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { tryCreatePostgresSchedulerRegistry } from "./postgres";
import type {
  SchedulerExecutionLog,
  SchedulerLifecycleStatus,
  SchedulerScheduleRecord,
} from "./types";
import { SCHEDULER_STATUS_TRANSITIONS } from "./types";

export type UpsertScheduleInput = {
  automationId: string;
  ownerId: string;
  cronExpression: string;
  timezone: string;
  presetType: string;
  nextRun: string | null;
  enabled: boolean;
};

type RegistryBucket = {
  schedules: Record<string, SchedulerScheduleRecord>;
  logs: Record<string, SchedulerExecutionLog>;
};

function canTransition(
  from: SchedulerLifecycleStatus,
  to: SchedulerLifecycleStatus,
): boolean {
  if (from === to) return true;
  return SCHEDULER_STATUS_TRANSITIONS[from].includes(to);
}

function defaultPath(): string {
  return (
    process.env.ATLAS_SCHEDULER_REGISTRY_FILE?.trim() ||
    `${process.cwd()}/.data/scheduler-registry.json`
  );
}

function emptyBucket(): RegistryBucket {
  return { schedules: {}, logs: {} };
}

/**
 * Durable scheduler registry.
 * File mode for tests; Postgres when DATABASE_URL is available and tables exist.
 * Process memory is never the SoT — always read/write through this store.
 */
export class SchedulerRegistryStore {
  private readonly path: string;
  private memory: RegistryBucket | null = null;

  constructor(path?: string) {
    this.path = path ?? defaultPath();
  }

  private load(): RegistryBucket {
    if (this.memory) return this.memory;
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as RegistryBucket;
      this.memory = {
        schedules: parsed.schedules ?? {},
        logs: parsed.logs ?? {},
      };
    } catch {
      this.memory = emptyBucket();
    }
    return this.memory;
  }

  private persist(): void {
    const bucket = this.load();
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(bucket, null, 2));
  }

  async upsertSchedule(input: UpsertScheduleInput): Promise<SchedulerScheduleRecord> {
    const bucket = this.load();
    const now = new Date().toISOString();
    const existing = Object.values(bucket.schedules).find(
      (s) => s.automationId === input.automationId,
    );
    if (existing) {
      const next: SchedulerScheduleRecord = {
        ...existing,
        ownerId: input.ownerId,
        cronExpression: input.cronExpression,
        timezone: input.timezone,
        presetType: input.presetType,
        nextRun: input.nextRun,
        enabled: input.enabled,
        status: input.enabled
          ? existing.status === "stopped"
            ? "scheduled"
            : existing.status
          : "stopped",
        updatedAt: now,
      };
      bucket.schedules[existing.scheduleId] = next;
      this.persist();
      return next;
    }

    const record: SchedulerScheduleRecord = {
      scheduleId: `sch_${input.automationId}`,
      automationId: input.automationId,
      ownerId: input.ownerId,
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      presetType: input.presetType,
      nextRun: input.nextRun,
      lastRun: null,
      lastSuccess: null,
      lastFailure: null,
      retryCount: 0,
      executionTime: null,
      durationMs: null,
      status: input.enabled ? "scheduled" : "stopped",
      enabled: input.enabled,
      idempotencyKey: null,
      lockOwner: null,
      lockExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    bucket.schedules[record.scheduleId] = record;
    this.persist();
    return record;
  }

  async getByAutomationId(
    automationId: string,
  ): Promise<SchedulerScheduleRecord | null> {
    const bucket = this.load();
    return (
      Object.values(bucket.schedules).find((s) => s.automationId === automationId) ??
      null
    );
  }

  async transitionStatus(input: {
    scheduleId: string;
    to: SchedulerLifecycleStatus;
    patch?: Partial<
      Pick<
        SchedulerScheduleRecord,
        | "nextRun"
        | "lastRun"
        | "lastSuccess"
        | "lastFailure"
        | "retryCount"
        | "executionTime"
        | "durationMs"
        | "idempotencyKey"
        | "lockOwner"
        | "lockExpiresAt"
      >
    >;
  }): Promise<SchedulerScheduleRecord | null> {
    const bucket = this.load();
    const current = bucket.schedules[input.scheduleId];
    if (!current) return null;
    if (!canTransition(current.status, input.to)) {
      throw new Error(
        `scheduler_invalid_transition:${current.status}->${input.to}`,
      );
    }
    const next: SchedulerScheduleRecord = {
      ...current,
      ...input.patch,
      status: input.to,
      updatedAt: new Date().toISOString(),
    };
    bucket.schedules[input.scheduleId] = next;
    this.persist();
    return next;
  }

  /** Acquire short lock for occurrence processing (dedup / single-runner). */
  async tryAcquireLock(input: {
    scheduleId: string;
    lockOwner: string;
    leaseMs: number;
    nowMs?: number;
  }): Promise<boolean> {
    const bucket = this.load();
    const current = bucket.schedules[input.scheduleId];
    if (!current || !current.enabled || current.status === "stopped") {
      return false;
    }
    const now = input.nowMs ?? Date.now();
    if (
      current.lockOwner &&
      current.lockExpiresAt &&
      new Date(current.lockExpiresAt).getTime() > now &&
      current.lockOwner !== input.lockOwner
    ) {
      return false;
    }
    bucket.schedules[input.scheduleId] = {
      ...current,
      lockOwner: input.lockOwner,
      lockExpiresAt: new Date(now + input.leaseMs).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return true;
  }

  async releaseLock(scheduleId: string, lockOwner: string): Promise<void> {
    const bucket = this.load();
    const current = bucket.schedules[scheduleId];
    if (!current || current.lockOwner !== lockOwner) return;
    bucket.schedules[scheduleId] = {
      ...current,
      lockOwner: null,
      lockExpiresAt: null,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  async appendExecutionLog(
    input: Omit<SchedulerExecutionLog, "logId" | "createdAt"> & {
      logId?: string;
    },
  ): Promise<{ log: SchedulerExecutionLog; created: boolean }> {
    const bucket = this.load();
    const existing = Object.values(bucket.logs).find(
      (l) => l.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      return { log: existing, created: false };
    }
    const log: SchedulerExecutionLog = {
      logId: input.logId ?? randomUUID(),
      scheduleId: input.scheduleId,
      automationId: input.automationId,
      ownerId: input.ownerId,
      jobId: input.jobId,
      occurrenceKey: input.occurrenceKey,
      idempotencyKey: input.idempotencyKey,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      retryCount: input.retryCount,
      createdAt: new Date().toISOString(),
    };
    bucket.logs[log.logId] = log;
    this.persist();
    return { log, created: true };
  }

  async updateExecutionLog(
    logId: string,
    patch: Partial<SchedulerExecutionLog>,
  ): Promise<SchedulerExecutionLog | null> {
    const bucket = this.load();
    const current = bucket.logs[logId];
    if (!current) return null;
    const next = { ...current, ...patch };
    bucket.logs[logId] = next;
    this.persist();
    return next;
  }

  async listLogs(limit = 200): Promise<SchedulerExecutionLog[]> {
    const bucket = this.load();
    return Object.values(bucket.logs)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listSchedules(): Promise<SchedulerScheduleRecord[]> {
    return Object.values(this.load().schedules);
  }

  async resetForTests(): Promise<void> {
    this.memory = emptyBucket();
    this.persist();
  }
}

export type SchedulerRegistryStoreLike = {
  upsertSchedule(
    input: UpsertScheduleInput,
  ): Promise<SchedulerScheduleRecord>;
  getByAutomationId(
    automationId: string,
  ): Promise<SchedulerScheduleRecord | null>;
  transitionStatus(input: {
    scheduleId: string;
    to: import("./types").SchedulerLifecycleStatus;
    patch?: Partial<
      Pick<
        SchedulerScheduleRecord,
        | "nextRun"
        | "lastRun"
        | "lastSuccess"
        | "lastFailure"
        | "retryCount"
        | "executionTime"
        | "durationMs"
        | "idempotencyKey"
        | "lockOwner"
        | "lockExpiresAt"
      >
    >;
  }): Promise<SchedulerScheduleRecord | null>;
  tryAcquireLock(input: {
    scheduleId: string;
    lockOwner: string;
    leaseMs: number;
    nowMs?: number;
  }): Promise<boolean>;
  releaseLock(scheduleId: string, lockOwner: string): Promise<void>;
  appendExecutionLog(
    input: Omit<SchedulerExecutionLog, "logId" | "createdAt"> & {
      logId?: string;
    },
  ): Promise<{ log: SchedulerExecutionLog; created: boolean }>;
  updateExecutionLog(
    logId: string,
    patch: Partial<SchedulerExecutionLog>,
  ): Promise<SchedulerExecutionLog | null>;
  listLogs(limit?: number): Promise<SchedulerExecutionLog[]>;
  listSchedules(): Promise<SchedulerScheduleRecord[]>;
  resetForTests(): Promise<void>;
};

let singleton: SchedulerRegistryStoreLike | null = null;

export function getSchedulerRegistryStore(): SchedulerRegistryStoreLike {
  if (singleton) return singleton;

  // Production: Postgres SoT. File only for Vitest / explicit force.
  const pg = tryCreatePostgresSchedulerRegistry();
  if (pg) {
    singleton = pg;
    return singleton;
  }

  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.ATLAS_RUNTIME === "production"
  ) {
    if (process.env.ATLAS_SCHEDULER_ALLOW_FILE?.trim().toLowerCase() !== "true") {
      throw new Error(
        "scheduler_registry_postgres_required: DATABASE_URL missing — process memory / file SoT forbidden in production",
      );
    }
  }

  singleton = new SchedulerRegistryStore();
  return singleton;
}

export function resetSchedulerRegistryStoreForTests(
  path?: string,
): SchedulerRegistryStore {
  singleton = new SchedulerRegistryStore(path);
  return singleton as SchedulerRegistryStore;
}
