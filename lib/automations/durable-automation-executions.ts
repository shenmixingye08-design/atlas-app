import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  assertAutomationBackendReady,
  resolveAutomationStorageBackend,
} from "./automation-backend";
import type { AutomationExecutionLogEntry } from "./execution-log/types";

export class AutomationExecutionStoreUnavailableError extends Error {
  readonly code = "automation_execution_store_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "AutomationExecutionStoreUnavailableError";
  }
}

export type DurableAutomationExecutionRow = {
  id: string;
  automationId: string;
  ownerUserId: string;
  organizationId: string | null;
  status:
    | "queued"
    | "running"
    | "success"
    | "failed"
    | "cancelled"
    | "awaiting_approval"
    | "skipped"
    | "retry_scheduled";
  triggerType: string;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
  nextRetryAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  workQueueJobId: string | null;
  workflowRunId: string | null;
  idempotencyKey: string | null;
  occurrenceKey: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type MemoryBucket = Map<string, DurableAutomationExecutionRow>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDurableAutomationExecutions?: MemoryBucket;
  };
  if (!scope.__atlasDurableAutomationExecutions) {
    scope.__atlasDurableAutomationExecutions = new Map();
  }
  return scope.__atlasDurableAutomationExecutions;
}

export function resetDurableAutomationExecutionsForTests(): void {
  getMemoryBucket().clear();
}

function mapLogStatus(
  status: AutomationExecutionLogEntry["status"],
): DurableAutomationExecutionRow["status"] {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "awaiting_approval") return "awaiting_approval";
  if (status === "skipped") return "skipped";
  return "running";
}

export function executionLogToDurableRow(
  entry: AutomationExecutionLogEntry,
  options?: {
    organizationId?: string | null;
    idempotencyKey?: string | null;
    occurrenceKey?: string | null;
    workQueueJobId?: string | null;
    workflowRunId?: string | null;
    attempt?: number;
    maxAttempts?: number;
    nextRetryAt?: string | null;
  },
): DurableAutomationExecutionRow {
  const ownerUserId = entry.userId?.trim();
  if (!ownerUserId) {
    throw new AutomationExecutionStoreUnavailableError(
      "[automations] P0-6: owner_user_id required for durable execution history",
    );
  }
  const now = new Date().toISOString();
  return {
    id: entry.id,
    automationId: entry.automationId,
    ownerUserId,
    organizationId: options?.organizationId ?? null,
    status: mapLogStatus(entry.status),
    triggerType: entry.triggerType,
    scheduledAt: entry.scheduledAt,
    startedAt: entry.startedAt,
    finishedAt: entry.completedAt,
    attempt: options?.attempt ?? Math.max(1, entry.retryCount + 1),
    maxAttempts: options?.maxAttempts ?? 3,
    retryCount: entry.retryCount,
    nextRetryAt: options?.nextRetryAt ?? null,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    workQueueJobId: options?.workQueueJobId ?? null,
    workflowRunId: options?.workflowRunId ?? null,
    idempotencyKey: options?.idempotencyKey ?? null,
    occurrenceKey: options?.occurrenceKey ?? null,
    payload: {
      generatedText: entry.generatedText,
      xPostId: entry.xPostId,
      xPostUrl: entry.xPostUrl,
      xApiSummary: entry.xApiSummary,
    },
    createdAt: entry.startedAt || now,
    updatedAt: now,
  };
}

function dbRowToDurable(data: Record<string, unknown>): DurableAutomationExecutionRow {
  return {
    id: String(data.id),
    automationId: String(data.automation_id),
    ownerUserId: String(data.owner_user_id),
    organizationId: (data.organization_id as string | null) ?? null,
    status: data.status as DurableAutomationExecutionRow["status"],
    triggerType: String(data.trigger_type ?? "automation"),
    scheduledAt: (data.scheduled_at as string | null) ?? null,
    startedAt: (data.started_at as string | null) ?? null,
    finishedAt: (data.finished_at as string | null) ?? null,
    attempt: Number(data.attempt ?? 1),
    maxAttempts: Number(data.max_attempts ?? 3),
    retryCount: Number(data.retry_count ?? 0),
    nextRetryAt: (data.next_retry_at as string | null) ?? null,
    errorCode: (data.error_code as string | null) ?? null,
    errorMessage: (data.error_message as string | null) ?? null,
    workQueueJobId: (data.work_queue_job_id as string | null) ?? null,
    workflowRunId: (data.workflow_run_id as string | null) ?? null,
    idempotencyKey: (data.idempotency_key as string | null) ?? null,
    occurrenceKey: (data.occurrence_key as string | null) ?? null,
    payload: (data.payload as Record<string, unknown>) ?? {},
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

function toDbPayload(row: DurableAutomationExecutionRow): Record<string, unknown> {
  return {
    id: row.id,
    automation_id: row.automationId,
    owner_user_id: row.ownerUserId,
    organization_id: row.organizationId,
    status: row.status,
    trigger_type: row.triggerType,
    scheduled_at: row.scheduledAt,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    attempt: row.attempt,
    max_attempts: row.maxAttempts,
    retry_count: row.retryCount,
    next_retry_at: row.nextRetryAt,
    error_code: row.errorCode,
    error_message: row.errorMessage,
    work_queue_job_id: row.workQueueJobId,
    workflow_run_id: row.workflowRunId,
    idempotency_key: row.idempotencyKey,
    occurrence_key: row.occurrenceKey,
    payload: row.payload,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/**
 * Upsert execution history row. Idempotent on (automation_id, idempotency_key).
 */
export async function upsertDurableAutomationExecution(
  row: DurableAutomationExecutionRow,
): Promise<DurableAutomationExecutionRow> {
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new AutomationExecutionStoreUnavailableError(
        "[automations] P0-6: durable execution upsert failed — memory fallback disabled (supabase_not_configured)",
      );
    }

    if (row.idempotencyKey) {
      const existing = await client
        .from("atlas_automation_executions" as never)
        .select("*")
        .eq("automation_id", row.automationId)
        .eq("idempotency_key", row.idempotencyKey)
        .maybeSingle();
      if (existing.data) {
        const { data, error } = await client
          .from("atlas_automation_executions" as never)
          .update(toDbPayload({ ...row, id: String((existing.data as { id: string }).id) }) as never)
          .eq("id", String((existing.data as { id: string }).id))
          .select("*")
          .maybeSingle();
        if (error || !data) {
          throw new AutomationExecutionStoreUnavailableError(
            `[automations] P0-6: durable execution update failed — memory fallback disabled (${error?.message ?? "empty"})`,
          );
        }
        return dbRowToDurable(data as Record<string, unknown>);
      }
    }

    const { data, error } = await client
      .from("atlas_automation_executions" as never)
      .upsert(toDbPayload(row) as never, { onConflict: "id" })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new AutomationExecutionStoreUnavailableError(
        `[automations] P0-6: durable execution upsert failed — memory fallback disabled (${error?.message ?? "empty"})`,
      );
    }
    return dbRowToDurable(data as Record<string, unknown>);
  }

  if (backend === "memory_durable") {
    const bucket = getMemoryBucket();
    if (row.idempotencyKey) {
      for (const existing of bucket.values()) {
        if (
          existing.automationId === row.automationId &&
          existing.idempotencyKey === row.idempotencyKey
        ) {
          const merged = {
            ...existing,
            ...row,
            id: existing.id,
            updatedAt: new Date().toISOString(),
          };
          bucket.set(existing.id, merged);
          return merged;
        }
      }
    }
    bucket.set(row.id, row);
    return row;
  }

  // local: accept into memory debug bucket without fail-closed
  getMemoryBucket().set(row.id, row);
  return row;
}

export async function listDurableAutomationExecutions(options?: {
  ownerUserId?: string;
  automationId?: string;
  limit?: number;
}): Promise<DurableAutomationExecutionRow[]> {
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();
  const limit = options?.limit ?? 100;

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new AutomationExecutionStoreUnavailableError(
        "[automations] P0-6: durable execution list failed — memory fallback disabled",
      );
    }
    let query = client
      .from("atlas_automation_executions" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (options?.ownerUserId) {
      query = query.eq("owner_user_id", options.ownerUserId);
    }
    if (options?.automationId) {
      query = query.eq("automation_id", options.automationId);
    }
    const { data, error } = await query;
    if (error) {
      throw new AutomationExecutionStoreUnavailableError(
        `[automations] P0-6: durable execution list failed — memory fallback disabled (${error.message})`,
      );
    }
    return ((data as Record<string, unknown>[] | null) ?? []).map(dbRowToDurable);
  }

  return [...getMemoryBucket().values()]
    .filter((row) =>
      options?.ownerUserId ? row.ownerUserId === options.ownerUserId : true,
    )
    .filter((row) =>
      options?.automationId ? row.automationId === options.automationId : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function scheduleDurableExecutionRetry(input: {
  executionId: string;
  ownerUserId: string;
  nextRetryAt: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<DurableAutomationExecutionRow> {
  const rows = await listDurableAutomationExecutions({
    ownerUserId: input.ownerUserId,
    limit: 500,
  });
  const existing = rows.find((row) => row.id === input.executionId);
  if (!existing) {
    throw new AutomationExecutionStoreUnavailableError(
      "[automations] P0-6: retry target execution not found",
    );
  }
  if (existing.ownerUserId !== input.ownerUserId) {
    throw new AutomationExecutionStoreUnavailableError(
      "[automations] P0-6: owner isolation refused retry",
    );
  }
  return upsertDurableAutomationExecution({
    ...existing,
    status: "retry_scheduled",
    retryCount: existing.retryCount + 1,
    attempt: existing.attempt + 1,
    nextRetryAt: input.nextRetryAt,
    errorCode: input.errorCode ?? existing.errorCode,
    errorMessage: input.errorMessage ?? existing.errorMessage,
    updatedAt: new Date().toISOString(),
  });
}

export async function cancelDurableAutomationExecution(input: {
  executionId: string;
  ownerUserId: string;
}): Promise<DurableAutomationExecutionRow> {
  const rows = await listDurableAutomationExecutions({
    ownerUserId: input.ownerUserId,
    limit: 500,
  });
  const existing = rows.find((row) => row.id === input.executionId);
  if (!existing || existing.ownerUserId !== input.ownerUserId) {
    throw new AutomationExecutionStoreUnavailableError(
      "[automations] P0-6: cancel refused (missing or owner mismatch)",
    );
  }
  return upsertDurableAutomationExecution({
    ...existing,
    status: "cancelled",
    finishedAt: new Date().toISOString(),
    nextRetryAt: null,
    updatedAt: new Date().toISOString(),
  });
}
