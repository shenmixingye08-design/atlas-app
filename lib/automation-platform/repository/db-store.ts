/**
 * P1-03: Automation V2 DB Single Source of Truth.
 * Process memory is cache only — never decide execution eligibility from memory alone.
 */

import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import type {
  AutomationRun,
  AutomationV2,
} from "@/lib/automation-platform/types";

import {
  isAutomationV2DbSotReady,
  markAutomationV2DbSotReadyUnknown,
  setAutomationV2DbSotReadyForTests,
} from "./table-ready";

const AUTOMATIONS_TABLE = "atlas_automations" as const;
const RUNS_TABLE = "atlas_automation_runs" as const;

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  trigger: AutomationV2["trigger"];
  workflow: AutomationV2["workflow"];
  execution_policy: AutomationV2["executionPolicy"];
  notification_policy: AutomationV2["notificationPolicy"];
  instruction: AutomationV2["instruction"];
  memory_policy: AutomationV2["memoryPolicy"];
  legacy_automation_id: string | null;
  schema_version: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  automation_id: string;
  user_id: string;
  status: string;
  run_key: string;
  idempotency_key: string;
  schedule_occurrence_key: string | null;
  trigger_type: string;
  scheduled_for: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  resolved_instruction: AutomationRun["resolvedInstruction"];
  memory_references: AutomationRun["memoryReferences"];
  status_history: AutomationRun["statusHistory"];
  approval_expires_at: string | null;
  result_summary: string | null;
  next_retry_at: string | null;
  payload: AutomationRun | Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type LocalDb = {
  automations: Map<string, AutomationV2>;
  runs: Map<string, AutomationRun>;
  occurrenceKeys: Map<string, string>;
  idempotencyKeys: Map<string, string>;
};

function getLocalDb(): LocalDb {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationV2DbSotLocal?: LocalDb;
  };
  if (!scope.__atlasAutomationV2DbSotLocal) {
    scope.__atlasAutomationV2DbSotLocal = {
      automations: new Map(),
      runs: new Map(),
      occurrenceKeys: new Map(),
      idempotencyKeys: new Map(),
    };
  }
  return scope.__atlasAutomationV2DbSotLocal;
}

export function resetAutomationV2DbStoreForTests(): void {
  const db = getLocalDb();
  db.automations.clear();
  db.runs.clear();
  db.occurrenceKeys.clear();
  db.idempotencyKeys.clear();
  setAutomationV2DbSotReadyForTests(true);
}

function isMissingError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table|column .*payload/i.test(
        message,
      ),
  );
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" || /duplicate|unique/i.test(error.message ?? "")
  );
}

function toAutomationRow(record: AutomationV2): AutomationRow {
  return {
    id: record.id,
    user_id: record.userId,
    name: record.name,
    description: record.description,
    status: record.status,
    trigger: record.trigger,
    workflow: record.workflow,
    execution_policy: record.executionPolicy,
    notification_policy: record.notificationPolicy,
    instruction: record.instruction,
    memory_policy: record.memoryPolicy,
    legacy_automation_id: record.legacyAutomationId,
    schema_version: record.schemaVersion,
    last_run_at: record.lastRunAt,
    next_run_at: record.nextRunAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function fromAutomationRow(row: AutomationRow): AutomationV2 {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? "",
    status: row.status as AutomationV2["status"],
    trigger: row.trigger,
    workflow: row.workflow,
    executionPolicy: row.execution_policy,
    notificationPolicy: row.notification_policy,
    instruction: row.instruction,
    memoryPolicy: row.memory_policy,
    legacyAutomationId: row.legacy_automation_id,
    schemaVersion: 2,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRunRow(run: AutomationRun): RunRow {
  return {
    id: run.id,
    automation_id: run.automationId,
    user_id: run.userId,
    status: run.status,
    run_key: run.runKey,
    idempotency_key: run.idempotencyKey,
    schedule_occurrence_key: run.scheduleOccurrenceKey,
    trigger_type: run.triggerType,
    scheduled_for: run.scheduledFor,
    queued_at: run.queuedAt,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    attempt_count: run.attemptCount,
    max_attempts: run.maxAttempts,
    last_error_code: run.lastErrorCode,
    last_error_message: run.lastErrorMessage,
    resolved_instruction: run.resolvedInstruction,
    memory_references: run.memoryReferences ?? [],
    status_history: run.statusHistory ?? [],
    approval_expires_at: run.approvalExpiresAt,
    result_summary: run.resultSummary,
    next_retry_at: run.nextRetryAt,
    payload: run,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  };
}

function fromRunRow(row: RunRow): AutomationRun {
  const payload =
    row.payload && typeof row.payload === "object"
      ? (row.payload as AutomationRun)
      : null;
  if (payload?.id && payload.userId) {
    return {
      ...payload,
      id: row.id,
      automationId: row.automation_id,
      userId: row.user_id,
      status: row.status as AutomationRun["status"],
      runKey: row.run_key,
      idempotencyKey: row.idempotency_key,
      scheduleOccurrenceKey: row.schedule_occurrence_key,
      triggerType: row.trigger_type as AutomationRun["triggerType"],
      scheduledFor: row.scheduled_for,
      queuedAt: row.queued_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      nextRetryAt: row.next_retry_at,
      approvalExpiresAt: row.approval_expires_at,
      resultSummary: row.result_summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  throw new Error(`[automation-v2] run payload missing for id=${row.id}`);
}

async function shouldUseLocalStandIn(): Promise<boolean> {
  if (isAtlasProduction()) return false;
  const ready = await isAutomationV2DbSotReady();
  if (ready && createServiceRoleClientIfConfigured()) return false;
  // Non-production without Supabase tables: local durable Map is the SoT stand-in.
  setAutomationV2DbSotReadyForTests(true);
  return true;
}

export async function dbUpsertAutomation(
  record: AutomationV2,
): Promise<AutomationV2> {
  if (await shouldUseLocalStandIn()) {
    getLocalDb().automations.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable (no service role)");
    }
    getLocalDb().automations.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  const { error } = await client
    .from(AUTOMATIONS_TABLE)
    .upsert(toAutomationRow(record), { onConflict: "id" });
  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(
          `[automation-v2] atlas_automations missing: ${error.message}`,
        );
      }
      getLocalDb().automations.set(record.id, structuredClone(record));
      return structuredClone(record);
    }
    throw new Error(`[automation-v2] upsert automation failed: ${error.message}`);
  }
  return structuredClone(record);
}

export async function dbGetAutomation(
  id: string,
): Promise<AutomationV2 | null> {
  if (await shouldUseLocalStandIn()) {
    const row = getLocalDb().automations.get(id);
    return row ? structuredClone(row) : null;
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getLocalDb().automations.get(id);
    return row ? structuredClone(row) : null;
  }
  const { data, error } = await client
    .from(AUTOMATIONS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      return null;
    }
    throw new Error(`[automation-v2] get automation failed: ${error.message}`);
  }
  return data ? fromAutomationRow(data as AutomationRow) : null;
}

export async function dbGetAutomationForUser(
  id: string,
  userId: string,
): Promise<AutomationV2 | null> {
  const row = await dbGetAutomation(id);
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function dbListAutomationsForUser(
  userId: string,
): Promise<AutomationV2[]> {
  if (await shouldUseLocalStandIn()) {
    return [...getLocalDb().automations.values()]
      .filter((row) => row.userId === userId)
      .map((row) => structuredClone(row))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return [...getLocalDb().automations.values()]
      .filter((row) => row.userId === userId)
      .map((row) => structuredClone(row));
  }
  const { data, error } = await client
    .from(AUTOMATIONS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      return [];
    }
    throw new Error(`[automation-v2] list automations failed: ${error.message}`);
  }
  return (data as AutomationRow[] | null)?.map(fromAutomationRow) ?? [];
}

/** Cron: due active scheduled automations from DB (not process memory). */
export async function dbListDueActiveAutomations(
  nowMs: number = Date.now(),
  limit = 50,
): Promise<AutomationV2[]> {
  const nowIso = new Date(nowMs).toISOString();
  if (await shouldUseLocalStandIn()) {
    return [...getLocalDb().automations.values()]
      .filter((item) => {
        if (item.status !== "active") return false;
        if (item.trigger.type !== "schedule") return false;
        if (!item.nextRunAt) return false;
        const t = Date.parse(item.nextRunAt);
        return Number.isFinite(t) && t <= nowMs;
      })
      .sort(
        (a, b) =>
          Date.parse(a.nextRunAt ?? "") - Date.parse(b.nextRunAt ?? ""),
      )
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable for due scan");
    }
    return [];
  }

  const { data, error } = await client
    .from(AUTOMATIONS_TABLE)
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(
          `[automation-v2] due scan schema missing: ${error.message}`,
        );
      }
      return [];
    }
    throw new Error(`[automation-v2] due scan failed: ${error.message}`);
  }

  return ((data as AutomationRow[] | null) ?? [])
    .map(fromAutomationRow)
    .filter((item) => item.trigger.type === "schedule" && item.nextRunAt);
}

export async function dbInsertRun(run: AutomationRun): Promise<{
  run: AutomationRun;
  created: boolean;
}> {
  if (await shouldUseLocalStandIn()) {
    const db = getLocalDb();
    if (db.idempotencyKeys.has(run.idempotencyKey)) {
      const id = db.idempotencyKeys.get(run.idempotencyKey)!;
      return { run: structuredClone(db.runs.get(id)!), created: false };
    }
    if (
      run.scheduleOccurrenceKey &&
      db.occurrenceKeys.has(run.scheduleOccurrenceKey)
    ) {
      const id = db.occurrenceKeys.get(run.scheduleOccurrenceKey)!;
      return { run: structuredClone(db.runs.get(id)!), created: false };
    }
    db.runs.set(run.id, structuredClone(run));
    db.idempotencyKeys.set(run.idempotencyKey, run.id);
    if (run.scheduleOccurrenceKey) {
      db.occurrenceKeys.set(run.scheduleOccurrenceKey, run.id);
    }
    return { run: structuredClone(run), created: true };
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable for run insert");
    }
    const db = getLocalDb();
    db.runs.set(run.id, structuredClone(run));
    db.idempotencyKeys.set(run.idempotencyKey, run.id);
    if (run.scheduleOccurrenceKey) {
      db.occurrenceKeys.set(run.scheduleOccurrenceKey, run.id);
    }
    return { run: structuredClone(run), created: true };
  }

  const { error } = await client.from(RUNS_TABLE).insert(toRunRow(run));
  if (!error) {
    return { run: structuredClone(run), created: true };
  }

  if (isUniqueViolation(error)) {
    const existing = await dbGetRunByIdempotencyOrOccurrence(run);
    if (existing) return { run: existing, created: false };
    return { run: structuredClone(run), created: false };
  }

  if (isMissingError(error.message)) {
    markAutomationV2DbSotReadyUnknown();
    if (isAtlasProduction()) {
      throw new Error(
        `[automation-v2] atlas_automation_runs missing: ${error.message}`,
      );
    }
    getLocalDb().runs.set(run.id, structuredClone(run));
    return { run: structuredClone(run), created: true };
  }

  throw new Error(`[automation-v2] insert run failed: ${error.message}`);
}

async function dbGetRunByIdempotencyOrOccurrence(
  run: AutomationRun,
): Promise<AutomationRun | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const byIdem = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("idempotency_key", run.idempotencyKey)
    .maybeSingle();
  if (byIdem.data) return fromRunRow(byIdem.data as RunRow);
  if (run.scheduleOccurrenceKey) {
    const byOcc = await client
      .from(RUNS_TABLE)
      .select("*")
      .eq("schedule_occurrence_key", run.scheduleOccurrenceKey)
      .maybeSingle();
    if (byOcc.data) return fromRunRow(byOcc.data as RunRow);
  }
  return null;
}

export async function dbUpsertRun(run: AutomationRun): Promise<AutomationRun> {
  if (await shouldUseLocalStandIn()) {
    const db = getLocalDb();
    db.runs.set(run.id, structuredClone(run));
    db.idempotencyKeys.set(run.idempotencyKey, run.id);
    if (run.scheduleOccurrenceKey) {
      db.occurrenceKeys.set(run.scheduleOccurrenceKey, run.id);
    }
    return structuredClone(run);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable for run upsert");
    }
    getLocalDb().runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }

  const { error } = await client
    .from(RUNS_TABLE)
    .upsert(toRunRow(run), { onConflict: "id" });
  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(
          `[automation-v2] run upsert schema missing: ${error.message}`,
        );
      }
      getLocalDb().runs.set(run.id, structuredClone(run));
      return structuredClone(run);
    }
    throw new Error(`[automation-v2] upsert run failed: ${error.message}`);
  }
  return structuredClone(run);
}

export async function dbGetRun(id: string): Promise<AutomationRun | null> {
  if (await shouldUseLocalStandIn()) {
    const row = getLocalDb().runs.get(id);
    return row ? structuredClone(row) : null;
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getLocalDb().runs.get(id);
    return row ? structuredClone(row) : null;
  }
  const { data, error } = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      return null;
    }
    throw new Error(`[automation-v2] get run failed: ${error.message}`);
  }
  return data ? fromRunRow(data as RunRow) : null;
}

export async function dbListRunsForAutomation(input: {
  userId: string;
  automationId: string;
}): Promise<AutomationRun[]> {
  if (await shouldUseLocalStandIn()) {
    return [...getLocalDb().runs.values()]
      .filter(
        (run) =>
          run.userId === input.userId &&
          run.automationId === input.automationId,
      )
      .map((run) => structuredClone(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];
  const { data, error } = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("user_id", input.userId)
    .eq("automation_id", input.automationId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingError(error.message)) return [];
    throw new Error(`[automation-v2] list runs failed: ${error.message}`);
  }
  return ((data as RunRow[] | null) ?? []).map(fromRunRow);
}

export async function dbListDispatchableRuns(
  limit = 20,
): Promise<AutomationRun[]> {
  const nowIso = new Date().toISOString();
  if (await shouldUseLocalStandIn()) {
    return [...getLocalDb().runs.values()]
      .filter((run) => {
        if (run.status === "queued") return true;
        if (run.status !== "retrying") return false;
        if (!run.nextRetryAt) return true;
        return Date.parse(run.nextRetryAt) <= Date.now();
      })
      .sort((a, b) => (a.queuedAt ?? a.createdAt).localeCompare(b.queuedAt ?? b.createdAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable for dispatch list");
    }
    return [];
  }

  const { data: queued, error: qErr } = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("status", "queued")
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (qErr) {
    if (isMissingError(qErr.message)) {
      markAutomationV2DbSotReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(qErr.message);
      }
      return [];
    }
    throw new Error(`[automation-v2] list queued failed: ${qErr.message}`);
  }

  const { data: retrying, error: rErr } = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("status", "retrying")
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("next_retry_at", { ascending: true })
    .limit(limit);
  if (rErr && !isMissingError(rErr.message)) {
    throw new Error(`[automation-v2] list retrying failed: ${rErr.message}`);
  }

  const merged = [
    ...((queued as RunRow[] | null) ?? []),
    ...((retrying as RunRow[] | null) ?? []),
  ]
    .map(fromRunRow)
    .slice(0, limit);
  return merged;
}

/**
 * Runs stuck in `running` past staleAfterMs (mid-step / terminal write races).
 * Used by dispatch to finalize when all steps are already terminal.
 */
export async function dbListStuckRunningRuns(
  limit = 10,
  staleAfterMs = 2 * 60 * 1000,
): Promise<AutomationRun[]> {
  const cutoffIso = new Date(Date.now() - staleAfterMs).toISOString();
  if (await shouldUseLocalStandIn()) {
    return [...getLocalDb().runs.values()]
      .filter(
        (run) =>
          run.status === "running" &&
          Date.parse(run.updatedAt) <= Date.parse(cutoffIso),
      )
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable for stuck running list");
    }
    return [];
  }

  const { data, error } = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("status", "running")
    .lte("updated_at", cutoffIso)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingError(error.message)) {
      markAutomationV2DbSotReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(error.message);
      }
      return [];
    }
    throw new Error(`[automation-v2] list stuck running failed: ${error.message}`);
  }
  return ((data as RunRow[] | null) ?? []).map(fromRunRow);
}

/**
 * Atomic claim: only one instance wins queued/retrying → running.
 */
export async function dbClaimRun(runId: string): Promise<AutomationRun | null> {
  const now = new Date().toISOString();

  if (await shouldUseLocalStandIn()) {
    const db = getLocalDb();
    const current = db.runs.get(runId);
    if (!current) return null;
    if (current.status !== "queued" && current.status !== "retrying") {
      return null;
    }
    if (
      current.status === "retrying" &&
      current.nextRetryAt &&
      Date.parse(current.nextRetryAt) > Date.now()
    ) {
      return null;
    }
    const claimed: AutomationRun = {
      ...current,
      status: "running",
      startedAt: current.startedAt ?? now,
      updatedAt: now,
    };
    db.runs.set(runId, structuredClone(claimed));
    return structuredClone(claimed);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[automation-v2] DB SoT unavailable for claim");
    }
    return null;
  }

  // Read then conditional update — uniqueness of status transition via filter.
  const { data: current, error: readError } = await client
    .from(RUNS_TABLE)
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (readError || !current) return null;
  const run = fromRunRow(current as RunRow);
  if (run.status !== "queued" && run.status !== "retrying") return null;
  if (
    run.status === "retrying" &&
    run.nextRetryAt &&
    Date.parse(run.nextRetryAt) > Date.now()
  ) {
    return null;
  }

  const claimed: AutomationRun = {
    ...run,
    status: "running",
    startedAt: run.startedAt ?? now,
    updatedAt: now,
  };

  const { data: updated, error: updateError } = await client
    .from(RUNS_TABLE)
    .update(toRunRow(claimed))
    .eq("id", runId)
    .in("status", ["queued", "retrying"])
    .select("*")
    .maybeSingle();

  if (updateError) {
    if (isMissingError(updateError.message)) {
      markAutomationV2DbSotReadyUnknown();
      if (isAtlasProduction()) {
        throw new Error(updateError.message);
      }
      return null;
    }
    throw new Error(`[automation-v2] claim failed: ${updateError.message}`);
  }
  if (!updated) return null; // lost race
  return fromRunRow(updated as RunRow);
}
