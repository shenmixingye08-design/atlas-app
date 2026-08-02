/**
 * Run lease store — prevents double execution across workers.
 * Memory-first with durable snapshot for restart recovery.
 */

import "server-only";

import {
  RELIABILITY_GLOBAL_DOMAIN_KEY,
  RELIABILITY_GLOBAL_USER_ID,
  RUN_LEASE_TTL_MS,
} from "@/lib/automation-platform/reliability/constants";

export type RunLease = {
  runId: string;
  ownerId: string;
  workerId: string;
  automationId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  token: string;
};

type LeaseState = {
  leases: Record<string, RunLease>;
  updatedAt: string;
};

function emptyState(): LeaseState {
  return { leases: {}, updatedAt: new Date().toISOString() };
}

function getMemory(): LeaseState {
  const scope = globalThis as typeof globalThis & {
    __atlasRunLeaseState?: LeaseState;
  };
  if (!scope.__atlasRunLeaseState) {
    scope.__atlasRunLeaseState = emptyState();
  }
  return scope.__atlasRunLeaseState;
}

function setMemory(state: LeaseState): void {
  const scope = globalThis as typeof globalThis & {
    __atlasRunLeaseState?: LeaseState;
  };
  scope.__atlasRunLeaseState = state;
}

function pruneExpired(state: LeaseState, nowMs: number): LeaseState {
  const leases: Record<string, RunLease> = {};
  for (const [id, lease] of Object.entries(state.leases)) {
    if (Date.parse(lease.expiresAt) > nowMs) {
      leases[id] = lease;
    }
  }
  return { leases, updatedAt: new Date(nowMs).toISOString() };
}

export function resetLeaseStoreForTests(): void {
  setMemory(emptyState());
}

export async function hydrateLeaseStore(): Promise<void> {
  try {
    const { loadSupabaseUserState } = await import(
      "@/lib/persistence/supabase-user-state"
    );
    const loaded = await loadSupabaseUserState<{
      version?: number;
      updatedAt?: string;
      payload?: LeaseState;
    }>(RELIABILITY_GLOBAL_USER_ID, RELIABILITY_GLOBAL_DOMAIN_KEY);
    const envelope = loaded;
    const nested = envelope?.payload;
    const state =
      nested && typeof nested === "object" && "leases" in nested
        ? (nested as LeaseState)
        : envelope &&
            typeof envelope === "object" &&
            "leases" in (envelope as object)
          ? (envelope as unknown as LeaseState)
          : null;
    if (state?.leases) {
      setMemory(pruneExpired(state, Date.now()));
    }
  } catch {
    // memory-only fallback
  }
}

async function persistLeaseStore(state: LeaseState): Promise<void> {
  setMemory(state);
  try {
    const { upsertSupabaseUserState } = await import(
      "@/lib/persistence/supabase-user-state"
    );
    await upsertSupabaseUserState(
      RELIABILITY_GLOBAL_USER_ID,
      RELIABILITY_GLOBAL_DOMAIN_KEY,
      {
        version: 1,
        updatedAt: state.updatedAt,
        payload: state,
      },
    );
  } catch {
    // best-effort durable
  }
}

export function getLease(runId: string): RunLease | null {
  const state = pruneExpired(getMemory(), Date.now());
  setMemory(state);
  return state.leases[runId] ?? null;
}

export function listActiveLeases(): RunLease[] {
  const state = pruneExpired(getMemory(), Date.now());
  setMemory(state);
  return Object.values(state.leases);
}

/**
 * Acquire lease if free or expired. Same worker+token may renew.
 * Returns null when another worker holds a valid lease.
 */
export async function acquireRunLease(input: {
  runId: string;
  ownerId: string;
  automationId: string;
  workerId: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<RunLease | null> {
  const nowMs = input.nowMs ?? Date.now();
  const ttl = input.ttlMs ?? RUN_LEASE_TTL_MS;
  let state = pruneExpired(getMemory(), nowMs);
  const existing = state.leases[input.runId];
  if (existing && Date.parse(existing.expiresAt) > nowMs) {
    if (existing.workerId !== input.workerId) {
      return null;
    }
    // renew
    const renewed: RunLease = {
      ...existing,
      heartbeatAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttl).toISOString(),
    };
    state = {
      leases: { ...state.leases, [input.runId]: renewed },
      updatedAt: new Date(nowMs).toISOString(),
    };
    await persistLeaseStore(state);
    return renewed;
  }

  const lease: RunLease = {
    runId: input.runId,
    ownerId: input.ownerId,
    automationId: input.automationId,
    workerId: input.workerId,
    acquiredAt: new Date(nowMs).toISOString(),
    heartbeatAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttl).toISOString(),
    token: crypto.randomUUID(),
  };
  state = {
    leases: { ...state.leases, [input.runId]: lease },
    updatedAt: new Date(nowMs).toISOString(),
  };
  await persistLeaseStore(state);
  return lease;
}

export async function heartbeatRunLease(input: {
  runId: string;
  workerId: string;
  token?: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<RunLease | null> {
  const nowMs = input.nowMs ?? Date.now();
  const ttl = input.ttlMs ?? RUN_LEASE_TTL_MS;
  const state = getMemory();
  const existing = state.leases[input.runId];
  if (!existing) return null;
  if (existing.workerId !== input.workerId) return null;
  if (input.token && existing.token !== input.token) return null;
  const next: RunLease = {
    ...existing,
    heartbeatAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttl).toISOString(),
  };
  await persistLeaseStore({
    leases: { ...state.leases, [input.runId]: next },
    updatedAt: new Date(nowMs).toISOString(),
  });
  return next;
}

export async function releaseRunLease(input: {
  runId: string;
  workerId: string;
}): Promise<void> {
  const state = getMemory();
  const existing = state.leases[input.runId];
  if (!existing) return;
  if (existing.workerId !== input.workerId) return;
  const leases = { ...state.leases };
  delete leases[input.runId];
  await persistLeaseStore({
    leases,
    updatedAt: new Date().toISOString(),
  });
}

/** Leases past expiry (for recovery scans). */
export function listExpiredLeaseRunIds(nowMs = Date.now()): string[] {
  const state = getMemory();
  return Object.values(state.leases)
    .filter((lease) => Date.parse(lease.expiresAt) <= nowMs)
    .map((lease) => lease.runId);
}
