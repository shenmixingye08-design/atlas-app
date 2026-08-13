/**
 * Durable condition trigger evaluation state (DB SoT + local stand-in).
 */

import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { AutomationTriggerState } from "./types";

const TABLE = "atlas_automation_trigger_state" as const;
export const CONDITION_EVAL_LEASE_MS = 45_000;

type TriggerStateRow = {
  automation_id: string;
  user_id: string;
  trigger_type: string;
  trigger_version: number;
  last_evaluated_at: string | null;
  last_condition_state: boolean | null;
  last_triggered_at: string | null;
  last_occurrence_key: string | null;
  last_event_id: string | null;
  last_provider_resource_id: string | null;
  triggered_resource_ids: unknown;
  evaluation_lease_owner: string | null;
  evaluation_lease_until: string | null;
  last_evaluation_error: string | null;
  evaluation_attempt_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type LocalTriggerDb = {
  states: Map<string, AutomationTriggerState>;
};

function getLocalDb(): LocalTriggerDb {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationTriggerStateLocal?: LocalTriggerDb;
  };
  if (!scope.__atlasAutomationTriggerStateLocal) {
    scope.__atlasAutomationTriggerStateLocal = { states: new Map() };
  }
  return scope.__atlasAutomationTriggerStateLocal;
}

export function resetAutomationTriggerStateStoreForTests(): void {
  getLocalDb().states.clear();
}

function isMissingError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

async function shouldUseLocalStandIn(): Promise<boolean> {
  if (isAtlasProduction()) return false;
  const client = createServiceRoleClientIfConfigured();
  if (!client) return true;
  // Prefer local stand-in in vitest / non-prod unless explicitly forced.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return true;
  return false;
}

function parseResourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function fromRow(row: TriggerStateRow): AutomationTriggerState {
  return {
    automationId: row.automation_id,
    userId: row.user_id,
    triggerType: row.trigger_type === "event" ? "event" : "condition",
    triggerVersion: row.trigger_version ?? 1,
    lastEvaluatedAt: row.last_evaluated_at,
    lastConditionState: row.last_condition_state,
    lastTriggeredAt: row.last_triggered_at,
    lastOccurrenceKey: row.last_occurrence_key,
    lastEventId: row.last_event_id,
    lastProviderResourceId: row.last_provider_resource_id,
    triggeredResourceIds: parseResourceIds(row.triggered_resource_ids),
    evaluationLeaseOwner: row.evaluation_lease_owner,
    evaluationLeaseUntil: row.evaluation_lease_until,
    lastEvaluationError: row.last_evaluation_error,
    evaluationAttemptCount: row.evaluation_attempt_count ?? 0,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(state: AutomationTriggerState): TriggerStateRow {
  return {
    automation_id: state.automationId,
    user_id: state.userId,
    trigger_type: state.triggerType,
    trigger_version: state.triggerVersion,
    last_evaluated_at: state.lastEvaluatedAt,
    last_condition_state: state.lastConditionState,
    last_triggered_at: state.lastTriggeredAt,
    last_occurrence_key: state.lastOccurrenceKey,
    last_event_id: state.lastEventId,
    last_provider_resource_id: state.lastProviderResourceId,
    triggered_resource_ids: state.triggeredResourceIds,
    evaluation_lease_owner: state.evaluationLeaseOwner,
    evaluation_lease_until: state.evaluationLeaseUntil,
    last_evaluation_error: state.lastEvaluationError,
    evaluation_attempt_count: state.evaluationAttemptCount,
    metadata: state.metadata,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  };
}

export function createEmptyTriggerState(input: {
  automationId: string;
  userId: string;
  triggerType: "condition" | "event";
  triggerVersion?: number;
  now?: Date;
}): AutomationTriggerState {
  const now = (input.now ?? new Date()).toISOString();
  return {
    automationId: input.automationId,
    userId: input.userId,
    triggerType: input.triggerType,
    triggerVersion: input.triggerVersion ?? 1,
    lastEvaluatedAt: null,
    lastConditionState: null,
    lastTriggeredAt: null,
    lastOccurrenceKey: null,
    lastEventId: null,
    lastProviderResourceId: null,
    triggeredResourceIds: [],
    evaluationLeaseOwner: null,
    evaluationLeaseUntil: null,
    lastEvaluationError: null,
    evaluationAttemptCount: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function getTriggerState(
  automationId: string,
): Promise<AutomationTriggerState | null> {
  if (await shouldUseLocalStandIn()) {
    const row = getLocalDb().states.get(automationId);
    return row ? structuredClone(row) : null;
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getLocalDb().states.get(automationId);
    return row ? structuredClone(row) : null;
  }
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("automation_id", automationId)
    .maybeSingle();
  if (error) {
    if (isMissingError(error.message)) {
      const row = getLocalDb().states.get(automationId);
      return row ? structuredClone(row) : null;
    }
    throw new Error(`[trigger-state] get failed: ${error.message}`);
  }
  return data ? fromRow(data as TriggerStateRow) : null;
}

export async function upsertTriggerState(
  state: AutomationTriggerState,
): Promise<AutomationTriggerState> {
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  if (await shouldUseLocalStandIn()) {
    getLocalDb().states.set(next.automationId, structuredClone(next));
    return structuredClone(next);
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    getLocalDb().states.set(next.automationId, structuredClone(next));
    return structuredClone(next);
  }
  // Table may be absent from generated Supabase types until schema sync.
  const { error } = await client.from(TABLE).upsert(toRow(next) as never, {
    onConflict: "automation_id",
  });
  if (error) {
    if (isMissingError(error.message)) {
      getLocalDb().states.set(next.automationId, structuredClone(next));
      return structuredClone(next);
    }
    throw new Error(`[trigger-state] upsert failed: ${error.message}`);
  }
  return structuredClone(next);
}

/**
 * Claim evaluation lease. Returns null when another evaluator holds a live lease.
 */
export async function claimTriggerEvaluationLease(input: {
  automationId: string;
  userId: string;
  triggerType: "condition" | "event";
  owner: string;
  nowMs?: number;
  leaseMs?: number;
}): Promise<AutomationTriggerState | null> {
  const nowMs = input.nowMs ?? Date.now();
  const leaseMs = input.leaseMs ?? CONDITION_EVAL_LEASE_MS;
  const existing =
    (await getTriggerState(input.automationId)) ??
    createEmptyTriggerState({
      automationId: input.automationId,
      userId: input.userId,
      triggerType: input.triggerType,
      now: new Date(nowMs),
    });

  const leaseUntilMs = existing.evaluationLeaseUntil
    ? Date.parse(existing.evaluationLeaseUntil)
    : 0;
  if (
    existing.evaluationLeaseOwner &&
    existing.evaluationLeaseOwner !== input.owner &&
    Number.isFinite(leaseUntilMs) &&
    leaseUntilMs > nowMs
  ) {
    return null;
  }

  const claimed: AutomationTriggerState = {
    ...existing,
    userId: input.userId,
    triggerType: input.triggerType,
    evaluationLeaseOwner: input.owner,
    evaluationLeaseUntil: new Date(nowMs + leaseMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };
  return upsertTriggerState(claimed);
}

export async function releaseTriggerEvaluationLease(input: {
  automationId: string;
  owner: string;
}): Promise<void> {
  const existing = await getTriggerState(input.automationId);
  if (!existing) return;
  if (
    existing.evaluationLeaseOwner &&
    existing.evaluationLeaseOwner !== input.owner
  ) {
    return;
  }
  await upsertTriggerState({
    ...existing,
    evaluationLeaseOwner: null,
    evaluationLeaseUntil: null,
  });
}
