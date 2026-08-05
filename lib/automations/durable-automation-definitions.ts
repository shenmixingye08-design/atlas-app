import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  assertAutomationBackendReady,
  resolveAutomationStorageBackend,
} from "./automation-backend";
import type { Automation } from "./types";
import { withAutomationDefaults } from "./repositories/server-automation-repository";

export class AutomationStoreUnavailableError extends Error {
  readonly code = "automation_store_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "AutomationStoreUnavailableError";
  }
}

export type DurableAutomationDefinitionRow = {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  title: string;
  status: string;
  enabled: boolean;
  paused: boolean;
  scheduleKind: string;
  scheduleCron: string | null;
  scheduleTimezone: string | null;
  scheduleLabel: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  definition: Automation;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type MemoryBucket = Map<string, DurableAutomationDefinitionRow>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDurableAutomationDefinitions?: MemoryBucket;
  };
  if (!scope.__atlasDurableAutomationDefinitions) {
    scope.__atlasDurableAutomationDefinitions = new Map();
  }
  return scope.__atlasDurableAutomationDefinitions;
}

export function resetDurableAutomationDefinitionsForTests(): void {
  getMemoryBucket().clear();
}

function scheduleFields(automation: Automation): {
  scheduleKind: string;
  scheduleCron: string | null;
  scheduleTimezone: string | null;
  scheduleLabel: string | null;
} {
  if (automation.schedule.kind === "schedule") {
    return {
      scheduleKind: "schedule",
      scheduleCron: automation.schedule.cron ?? null,
      scheduleTimezone: automation.schedule.timezone,
      scheduleLabel: automation.schedule.label,
    };
  }
  return {
    scheduleKind: automation.schedule.kind,
    scheduleCron: null,
    scheduleTimezone: null,
    scheduleLabel: automation.schedule.label,
  };
}

export function automationToDurableRow(
  automation: Automation,
  options?: { organizationId?: string | null },
): DurableAutomationDefinitionRow {
  const normalized = withAutomationDefaults(automation);
  if (!normalized.userId?.trim()) {
    throw new AutomationStoreUnavailableError(
      "[automations] P0-6: owner_user_id required for durable automation definition",
    );
  }
  const sched = scheduleFields(normalized);
  const paused = !normalized.enabled;
  return {
    id: normalized.id,
    ownerUserId: normalized.userId,
    organizationId: options?.organizationId ?? null,
    title: normalized.name,
    status: paused && normalized.status === "idle" ? "paused" : normalized.status,
    enabled: normalized.enabled,
    paused,
    scheduleKind: sched.scheduleKind,
    scheduleCron: sched.scheduleCron,
    scheduleTimezone: sched.scheduleTimezone,
    scheduleLabel: sched.scheduleLabel,
    nextRunAt: normalized.nextRun,
    lastRunAt: normalized.lastRun,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: normalized.lastError,
    definition: normalized,
    version: 1,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    deletedAt: null,
  };
}

export function durableRowToAutomation(
  row: DurableAutomationDefinitionRow,
): Automation {
  return withAutomationDefaults({
    ...row.definition,
    id: row.id,
    userId: row.ownerUserId,
    name: row.title,
    enabled: row.enabled,
    nextRun: row.nextRunAt,
    lastRun: row.lastRunAt,
    lastError: row.lastErrorMessage,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  });
}

function dbRowToDurable(data: Record<string, unknown>): DurableAutomationDefinitionRow {
  const definition = (data.definition ?? {}) as Automation;
  return {
    id: String(data.id),
    ownerUserId: String(data.owner_user_id),
    organizationId: (data.organization_id as string | null) ?? null,
    title: String(data.title),
    status: String(data.status),
    enabled: Boolean(data.enabled),
    paused: Boolean(data.paused),
    scheduleKind: String(data.schedule_kind ?? "schedule"),
    scheduleCron: (data.schedule_cron as string | null) ?? null,
    scheduleTimezone: (data.schedule_timezone as string | null) ?? null,
    scheduleLabel: (data.schedule_label as string | null) ?? null,
    nextRunAt: (data.next_run_at as string | null) ?? null,
    lastRunAt: (data.last_run_at as string | null) ?? null,
    retryCount: Number(data.retry_count ?? 0),
    maxRetries: Number(data.max_retries ?? 3),
    nextRetryAt: (data.next_retry_at as string | null) ?? null,
    lastErrorCode: (data.last_error_code as string | null) ?? null,
    lastErrorMessage: (data.last_error_message as string | null) ?? null,
    definition,
    version: Number(data.version ?? 1),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    deletedAt: (data.deleted_at as string | null) ?? null,
  };
}

function toDbPayload(row: DurableAutomationDefinitionRow): Record<string, unknown> {
  return {
    id: row.id,
    owner_user_id: row.ownerUserId,
    organization_id: row.organizationId,
    title: row.title,
    status: row.status,
    enabled: row.enabled,
    paused: row.paused,
    schedule_kind: row.scheduleKind,
    schedule_cron: row.scheduleCron,
    schedule_timezone: row.scheduleTimezone,
    schedule_label: row.scheduleLabel,
    next_run_at: row.nextRunAt,
    last_run_at: row.lastRunAt,
    retry_count: row.retryCount,
    max_retries: row.maxRetries,
    next_retry_at: row.nextRetryAt,
    last_error_code: row.lastErrorCode,
    last_error_message: row.lastErrorMessage,
    definition: row.definition,
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    deleted_at: row.deletedAt,
  };
}

async function upsertSupabase(
  row: DurableAutomationDefinitionRow,
): Promise<{ ok: true; row: DurableAutomationDefinitionRow } | { ok: false; error: string }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_not_configured" };
  }
  const { data, error } = await client
    .from("atlas_automation_definitions" as never)
    .upsert(toDbPayload(row) as never, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "upsert_returned_empty" };
  }
  return { ok: true, row: dbRowToDurable(data as Record<string, unknown>) };
}

async function softDeleteMissingSupabase(
  ownerUserId: string,
  keepIds: Set<string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_not_configured" };
  }
  const { data, error } = await client
    .from("atlas_automation_definitions" as never)
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: error.message };
  }

  const now = new Date().toISOString();
  for (const row of (data as Array<{ id: string }> | null) ?? []) {
    if (keepIds.has(row.id)) continue;
    const { error: delError } = await client
      .from("atlas_automation_definitions" as never)
      .update({ deleted_at: now, updated_at: now, enabled: false, paused: true } as never)
      .eq("id", row.id)
      .eq("owner_user_id", ownerUserId);
    if (delError) {
      return { ok: false, error: delError.message };
    }
  }
  return { ok: true };
}

/**
 * Replace owner's durable automation definitions (write-through SoT).
 * Production: Supabase only — never succeeds on memory alone.
 */
export async function replaceDurableAutomationsForOwner(
  ownerUserId: string,
  automations: Automation[],
  options?: { organizationId?: string | null },
): Promise<void> {
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();
  const owned = automations
    .map((row) => withAutomationDefaults(row))
    .filter((row) => row.userId === ownerUserId);
  const keepIds = new Set(owned.map((row) => row.id));

  if (backend === "supabase") {
    for (const automation of owned) {
      const row = automationToDurableRow(automation, {
        organizationId: options?.organizationId,
      });
      const result = await upsertSupabase(row);
      if (!result.ok) {
        throw new AutomationStoreUnavailableError(
          `[automations] P0-6: durable definition upsert failed — memory fallback disabled (${result.error})`,
        );
      }
    }
    const del = await softDeleteMissingSupabase(ownerUserId, keepIds);
    if (!del.ok) {
      throw new AutomationStoreUnavailableError(
        `[automations] P0-6: durable definition soft-delete failed — memory fallback disabled (${del.error})`,
      );
    }
    return;
  }

  if (backend === "memory_durable") {
    const bucket = getMemoryBucket();
    for (const [id, row] of [...bucket.entries()]) {
      if (row.ownerUserId === ownerUserId && !keepIds.has(id)) {
        bucket.set(id, {
          ...row,
          deletedAt: new Date().toISOString(),
          enabled: false,
          paused: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    for (const automation of owned) {
      const row = automationToDurableRow(automation, {
        organizationId: options?.organizationId,
      });
      const existing = bucket.get(row.id);
      bucket.set(row.id, {
        ...row,
        version: (existing?.version ?? 0) + 1,
        createdAt: existing?.createdAt ?? row.createdAt,
        deletedAt: null,
      });
    }
    return;
  }

  // local: no durable row write required
}

export async function listDurableAutomationsForOwner(
  ownerUserId: string,
): Promise<Automation[]> {
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new AutomationStoreUnavailableError(
        "[automations] P0-6: durable list failed — memory fallback disabled (supabase_not_configured)",
      );
    }
    const { data, error } = await client
      .from("atlas_automation_definitions" as never)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null);

    if (error) {
      throw new AutomationStoreUnavailableError(
        `[automations] P0-6: durable list failed — memory fallback disabled (${error.message})`,
      );
    }
    return ((data as Record<string, unknown>[] | null) ?? []).map((row) =>
      durableRowToAutomation(dbRowToDurable(row)),
    );
  }

  if (backend === "memory_durable") {
    return [...getMemoryBucket().values()]
      .filter((row) => row.ownerUserId === ownerUserId && !row.deletedAt)
      .map(durableRowToAutomation);
  }

  return [];
}

export async function getDurableAutomationById(
  automationId: string,
): Promise<Automation | null> {
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new AutomationStoreUnavailableError(
        "[automations] P0-6: durable get failed — memory fallback disabled (supabase_not_configured)",
      );
    }
    const { data, error } = await client
      .from("atlas_automation_definitions" as never)
      .select("*")
      .eq("id", automationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw new AutomationStoreUnavailableError(
        `[automations] P0-6: durable get failed — memory fallback disabled (${error.message})`,
      );
    }
    if (!data) return null;
    return durableRowToAutomation(dbRowToDurable(data as Record<string, unknown>));
  }

  if (backend === "memory_durable") {
    const row = getMemoryBucket().get(automationId);
    if (!row || row.deletedAt) return null;
    return durableRowToAutomation(row);
  }

  return null;
}

export async function listDueDurableAutomationIds(options?: {
  now?: Date;
  limit?: number;
}): Promise<string[]> {
  const nowIso = (options?.now ?? new Date()).toISOString();
  const limit = options?.limit ?? 100;
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();

  if (backend === "memory_durable") {
    return [...getMemoryBucket().values()]
      .filter(
        (row) =>
          !row.deletedAt &&
          row.enabled &&
          !row.paused &&
          row.nextRunAt != null &&
          row.nextRunAt <= nowIso,
      )
      .sort((a, b) => String(a.nextRunAt).localeCompare(String(b.nextRunAt)))
      .slice(0, limit)
      .map((row) => row.id);
  }

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new AutomationStoreUnavailableError(
        "[automations] P0-6: durable due-list failed — memory fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_automation_definitions" as never)
      .select("id")
      .eq("enabled", true)
      .eq("paused", false)
      .is("deleted_at", null)
      .lte("next_run_at", nowIso)
      .order("next_run_at", { ascending: true })
      .limit(limit);
    if (error) {
      throw new AutomationStoreUnavailableError(
        `[automations] P0-6: durable due-list failed — memory fallback disabled (${error.message})`,
      );
    }
    return ((data as Array<{ id: string }> | null) ?? []).map((row) => row.id);
  }

  return [];
}
