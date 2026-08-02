import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

/**
 * Durable idempotency for external actions / artifact generation / notifications.
 * Backed by atlas_user_state domain (same persistence model as runs).
 * Process Map is a hot cache; durable domain is the source of truth across restarts.
 */

export const AUTOMATION_IDEMPOTENCY_DOMAIN_KEY = "atlasAutomationIdempotencyV2";

export type IdempotencyRecord = {
  key: string;
  kind:
    | "occurrence"
    | "step_attempt"
    | "external_action"
    | "artifact"
    | "notification"
    | "approval";
  runId: string | null;
  stepId: string | null;
  externalActionId: string | null;
  artifactId: string | null;
  createdAt: string;
};

type DurableState = {
  records: IdempotencyRecord[];
};

type MemoryBucket = Map<string, IdempotencyRecord>;

function getMemory(): MemoryBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationIdempotencyV2?: MemoryBucket;
  };
  if (!globalScope.__atlasAutomationIdempotencyV2) {
    globalScope.__atlasAutomationIdempotencyV2 = new Map();
  }
  return globalScope.__atlasAutomationIdempotencyV2;
}

function compact(state: DurableState): DurableState {
  const sorted = [...state.records].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return { records: sorted.slice(0, 2000) };
}

export function resetAutomationIdempotencyForTests(): void {
  getMemory().clear();
}

export async function ensureIdempotencyHydrated(userId: string): Promise<void> {
  const mem = getMemory();
  if (mem.size > 0) return;
  const loaded = await loadDurableDomain<DurableState>(
    userId,
    AUTOMATION_IDEMPOTENCY_DOMAIN_KEY,
  );
  if (!loaded?.records) return;
  for (const row of loaded.records) {
    if (row?.key) mem.set(row.key, row);
  }
}

export function getIdempotencyRecord(key: string): IdempotencyRecord | null {
  return getMemory().get(key) ?? null;
}

async function persistBucket(userId: string): Promise<void> {
  const mem = getMemory();
  const snapshot: DurableState = {
    records: [...mem.values()],
  };
  void persistDurableDomain(
    userId,
    AUTOMATION_IDEMPOTENCY_DOMAIN_KEY,
    snapshot,
    { compact, forceSupabase: true },
  );
}

export async function reserveIdempotencyKey(input: {
  userId: string;
  key: string;
  kind: IdempotencyRecord["kind"];
  runId?: string | null;
  stepId?: string | null;
  externalActionId?: string | null;
  artifactId?: string | null;
}): Promise<{ created: boolean; record: IdempotencyRecord }> {
  await ensureIdempotencyHydrated(input.userId);
  const mem = getMemory();
  const existing = mem.get(input.key);
  if (existing) {
    return { created: false, record: existing };
  }

  const record: IdempotencyRecord = {
    key: input.key,
    kind: input.kind,
    runId: input.runId ?? null,
    stepId: input.stepId ?? null,
    externalActionId: input.externalActionId ?? null,
    artifactId: input.artifactId ?? null,
    createdAt: new Date().toISOString(),
  };
  mem.set(input.key, record);
  await persistBucket(input.userId);

  return { created: true, record };
}

export async function completeIdempotencyRecord(input: {
  userId: string;
  key: string;
  externalActionId?: string | null;
  artifactId?: string | null;
}): Promise<IdempotencyRecord | null> {
  await ensureIdempotencyHydrated(input.userId);
  const mem = getMemory();
  const existing = mem.get(input.key);
  if (!existing) return null;
  const next: IdempotencyRecord = {
    ...existing,
    externalActionId: input.externalActionId ?? existing.externalActionId,
    artifactId: input.artifactId ?? existing.artifactId,
  };
  mem.set(input.key, next);
  await persistBucket(input.userId);
  return next;
}

export function buildExternalActionKey(input: {
  automationId: string;
  occurrenceKey: string | null;
  stepId: string;
  action: string;
}): string {
  return [
    "ext",
    input.automationId,
    input.occurrenceKey ?? "manual",
    input.stepId,
    input.action,
  ].join(":");
}

export function buildArtifactGenerationKey(input: {
  runId: string;
  stepId: string;
  attempt: number;
  format: string;
}): string {
  return ["art", input.runId, input.stepId, String(input.attempt), input.format].join(
    ":",
  );
}

export function buildNotificationDeliveryKey(input: {
  runId: string;
  stepId: string;
  channel: string;
}): string {
  return ["ntf", input.runId, input.stepId, input.channel].join(":");
}
