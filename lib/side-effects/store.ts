/**
 * P1-04: Durable side-effect claim store (Production DB SoT).
 * Process memory is a non-prod stand-in / cache — never Production SoT.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  buildSideEffectClaimId,
  buildSideEffectIdempotencyKey,
  fingerprintDestination,
} from "./keys";
import {
  markSideEffectIdempotencyReadyUnknown,
  setSideEffectIdempotencyReadyForTests,
  isSideEffectIdempotencyReady,
} from "./table-ready";
import type {
  SideEffectClaim,
  SideEffectContext,
  SideEffectStatus,
} from "./types";

export const SIDE_EFFECT_LEASE_MS = 60_000;
export const SIDE_EFFECT_TABLE = "atlas_side_effect_claims" as const;

type ClaimRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  provider: string;
  action_type: string;
  automation_id: string | null;
  run_id: string | null;
  occurrence_key: string | null;
  destination_fingerprint: string;
  status: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  max_attempts: number;
  provider_resource_id: string | null;
  provider_request_id: string | null;
  evidence: Record<string, unknown> | null;
  result_payload: Record<string, unknown> | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type LocalDb = {
  claims: Map<string, SideEffectClaim>;
  byUserKey: Map<string, string>;
  claimLocks: Map<string, Promise<void>>;
};

function getLocalDb(): LocalDb {
  const scope = globalThis as typeof globalThis & {
    __atlasSideEffectClaimsLocal?: LocalDb;
  };
  if (!scope.__atlasSideEffectClaimsLocal) {
    scope.__atlasSideEffectClaimsLocal = {
      claims: new Map(),
      byUserKey: new Map(),
      claimLocks: new Map(),
    };
  }
  return scope.__atlasSideEffectClaimsLocal;
}

export function resetSideEffectStoreForTests(): void {
  const db = getLocalDb();
  db.claims.clear();
  db.byUserKey.clear();
  db.claimLocks.clear();
  setSideEffectIdempotencyReadyForTests(true);
}

async function withLocalClaimLock(
  claimId: string,
  fn: () => SideEffectClaim | null | Promise<SideEffectClaim | null>,
): Promise<SideEffectClaim | null> {
  const db = getLocalDb();
  const previous = db.claimLocks.get(claimId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  db.claimLocks.set(
    claimId,
    previous.then(() => gate).catch(() => gate),
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function userKey(userId: string, idempotencyKey: string): string {
  return `${userId}::${idempotencyKey}`;
}

function fromRow(row: ClaimRow): SideEffectClaim {
  return {
    id: row.id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    provider: row.provider as SideEffectClaim["provider"],
    actionType: row.action_type as SideEffectClaim["actionType"],
    automationId: row.automation_id,
    runId: row.run_id,
    occurrenceKey: row.occurrence_key,
    destinationFingerprint: row.destination_fingerprint,
    status: row.status as SideEffectStatus,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    providerResourceId: row.provider_resource_id,
    providerRequestId: row.provider_request_id,
    evidence: row.evidence ?? {},
    resultPayload: row.result_payload ?? {},
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toRow(claim: SideEffectClaim): ClaimRow {
  return {
    id: claim.id,
    user_id: claim.userId,
    idempotency_key: claim.idempotencyKey,
    provider: claim.provider,
    action_type: claim.actionType,
    automation_id: claim.automationId,
    run_id: claim.runId,
    occurrence_key: claim.occurrenceKey,
    destination_fingerprint: claim.destinationFingerprint,
    status: claim.status,
    lease_owner: claim.leaseOwner,
    lease_expires_at: claim.leaseExpiresAt,
    attempt_count: claim.attemptCount,
    max_attempts: claim.maxAttempts,
    provider_resource_id: claim.providerResourceId,
    provider_request_id: claim.providerRequestId,
    evidence: claim.evidence,
    result_payload: claim.resultPayload,
    last_error_code: claim.lastErrorCode,
    last_error_message: claim.lastErrorMessage,
    created_at: claim.createdAt,
    updated_at: claim.updatedAt,
    completed_at: claim.completedAt,
  };
}

function isMissingError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

async function shouldUseLocalStandIn(): Promise<boolean> {
  if (isAtlasProduction()) return false;
  const ready = await isSideEffectIdempotencyReady();
  if (ready && createServiceRoleClientIfConfigured()) return false;
  setSideEffectIdempotencyReadyForTests(true);
  return true;
}

function newPendingClaim(ctx: SideEffectContext): SideEffectClaim {
  const idempotencyKey = buildSideEffectIdempotencyKey(ctx);
  const now = new Date().toISOString();
  return {
    id: buildSideEffectClaimId(idempotencyKey, ctx.userId),
    userId: ctx.userId,
    idempotencyKey,
    provider: ctx.provider,
    actionType: ctx.actionType,
    automationId: ctx.automationId ?? null,
    runId: ctx.runId ?? null,
    occurrenceKey: ctx.occurrenceKey ?? null,
    destinationFingerprint: fingerprintDestination(ctx.destination),
    status: "pending",
    leaseOwner: null,
    leaseExpiresAt: null,
    attemptCount: 0,
    maxAttempts: 8,
    providerResourceId: null,
    providerRequestId: null,
    evidence: {},
    resultPayload: {},
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export async function ensureSideEffectClaim(
  ctx: SideEffectContext,
): Promise<SideEffectClaim> {
  if (!ctx.userId.trim()) {
    throw new Error("[side-effects] userId required");
  }
  const draft = newPendingClaim(ctx);

  if (await shouldUseLocalStandIn()) {
    return (
      (await withLocalClaimLock(draft.id, () => {
        const db = getLocalDb();
        const existingId = db.byUserKey.get(
          userKey(draft.userId, draft.idempotencyKey),
        );
        if (existingId) {
          const existing = db.claims.get(existingId);
          if (existing && existing.userId === ctx.userId) {
            return structuredClone(existing);
          }
        }
        db.claims.set(draft.id, structuredClone(draft));
        db.byUserKey.set(userKey(draft.userId, draft.idempotencyKey), draft.id);
        return structuredClone(draft);
      })) ?? draft
    );
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[side-effects] DB SoT unavailable (no service role)");
    }
    const db = getLocalDb();
    db.claims.set(draft.id, structuredClone(draft));
    db.byUserKey.set(userKey(draft.userId, draft.idempotencyKey), draft.id);
    return structuredClone(draft);
  }

  const { data: existing, error: readError } = await client
    .from(SIDE_EFFECT_TABLE)
    .select("*")
    .eq("user_id", draft.userId)
    .eq("idempotency_key", draft.idempotencyKey)
    .maybeSingle();
  if (readError && !isMissingError(readError.message)) {
    throw new Error(`[side-effects] read failed: ${readError.message}`);
  }
  if (existing) {
    const owned = fromRow(existing as ClaimRow);
    if (owned.userId !== ctx.userId) {
      throw new Error("[side-effects] ownership violation");
    }
    return owned;
  }

  const { error: insertError } = await client
    .from(SIDE_EFFECT_TABLE)
    .insert(toRow(draft));
  if (!insertError) return structuredClone(draft);

  if (insertError.code === "23505" || /duplicate|unique/i.test(insertError.message)) {
    const { data: raced } = await client
      .from(SIDE_EFFECT_TABLE)
      .select("*")
      .eq("user_id", draft.userId)
      .eq("idempotency_key", draft.idempotencyKey)
      .maybeSingle();
    if (raced) return fromRow(raced as ClaimRow);
  }
  if (isMissingError(insertError.message)) {
    markSideEffectIdempotencyReadyUnknown();
    if (isAtlasProduction()) {
      throw new Error(
        `[side-effects] atlas_side_effect_claims missing: ${insertError.message}`,
      );
    }
    const db = getLocalDb();
    db.claims.set(draft.id, structuredClone(draft));
    db.byUserKey.set(userKey(draft.userId, draft.idempotencyKey), draft.id);
    return structuredClone(draft);
  }
  throw new Error(`[side-effects] insert failed: ${insertError.message}`);
}

function applyLocalClaimSemantics(
  current: SideEffectClaim,
  leaseOwner: string,
  leaseMs: number,
): SideEffectClaim {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  if (current.status === "succeeded" || current.status === "unknown_outcome") {
    return structuredClone(current);
  }
  if (
    current.status === "processing" &&
    current.leaseExpiresAt &&
    Date.parse(current.leaseExpiresAt) > now
  ) {
    return structuredClone(current);
  }
  if (
    current.status === "processing" &&
    (!current.leaseExpiresAt || Date.parse(current.leaseExpiresAt) <= now) &&
    !current.providerResourceId
  ) {
    return {
      ...current,
      status: "unknown_outcome",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: "crash_after_success_ambiguous",
      lastErrorMessage: "stale processing without provider resource id",
      completedAt: nowIso,
      updatedAt: nowIso,
    };
  }
  if (
    current.status === "pending" ||
    current.status === "failed" ||
    (current.status === "processing" && Boolean(current.providerResourceId))
  ) {
    return {
      ...current,
      status: "processing",
      leaseOwner,
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
      attemptCount: current.attemptCount + 1,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: nowIso,
    };
  }
  return structuredClone(current);
}

/**
 * Atomic claim for a user's own side-effect row.
 * Ownership is enforced: userId must match.
 */
export async function claimSideEffect(input: {
  claimId: string;
  userId: string;
  leaseOwner?: string;
  leaseMs?: number;
}): Promise<SideEffectClaim | null> {
  const leaseOwner = input.leaseOwner ?? `worker_${randomUUID().slice(0, 8)}`;
  const leaseMs = input.leaseMs ?? SIDE_EFFECT_LEASE_MS;

  if (await shouldUseLocalStandIn()) {
    return withLocalClaimLock(input.claimId, () => {
      const db = getLocalDb();
      const current = db.claims.get(input.claimId);
      if (!current || current.userId !== input.userId) return null;
      const next = applyLocalClaimSemantics(current, leaseOwner, leaseMs);
      db.claims.set(input.claimId, structuredClone(next));
      return structuredClone(next);
    });
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[side-effects] DB SoT unavailable for claim");
    }
    return null;
  }

  const { data, error } = await client.rpc("atlas_claim_side_effect", {
    p_id: input.claimId,
    p_user_id: input.userId,
    p_lease_owner: leaseOwner,
    p_lease_ms: leaseMs,
  });

  if (error) {
    if (isMissingError(error.message) || /function .* does not exist/i.test(error.message)) {
      // Fallback path when RPC not applied yet: conditional update (still ownership-scoped).
      return claimSideEffectFallback({
        claimId: input.claimId,
        userId: input.userId,
        leaseOwner,
        leaseMs,
      });
    }
    throw new Error(`[side-effects] claim rpc failed: ${error.message}`);
  }
  if (!data) return null;
  const claim = fromRow(data as ClaimRow);
  if (claim.userId !== input.userId) return null;
  return claim;
}

async function claimSideEffectFallback(input: {
  claimId: string;
  userId: string;
  leaseOwner: string;
  leaseMs: number;
}): Promise<SideEffectClaim | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const { data: current, error } = await client
    .from(SIDE_EFFECT_TABLE)
    .select("*")
    .eq("id", input.claimId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error || !current) return null;
  const row = fromRow(current as ClaimRow);
  const next = applyLocalClaimSemantics(row, input.leaseOwner, input.leaseMs);
  if (next.status === row.status && next.leaseOwner === row.leaseOwner) {
    return next;
  }
  const { data: updated, error: updateError } = await client
    .from(SIDE_EFFECT_TABLE)
    .update(toRow(next))
    .eq("id", input.claimId)
    .eq("user_id", input.userId)
    .eq("status", row.status)
    .select("*")
    .maybeSingle();
  if (updateError) {
    if (isMissingError(updateError.message)) {
      markSideEffectIdempotencyReadyUnknown();
      if (isAtlasProduction()) throw new Error(updateError.message);
      return null;
    }
    throw new Error(`[side-effects] claim fallback failed: ${updateError.message}`);
  }
  if (!updated) {
    const { data: raced } = await client
      .from(SIDE_EFFECT_TABLE)
      .select("*")
      .eq("id", input.claimId)
      .eq("user_id", input.userId)
      .maybeSingle();
    return raced ? fromRow(raced as ClaimRow) : null;
  }
  return fromRow(updated as ClaimRow);
}

export async function getSideEffectClaimForUser(
  claimId: string,
  userId: string,
): Promise<SideEffectClaim | null> {
  if (await shouldUseLocalStandIn()) {
    const row = getLocalDb().claims.get(claimId);
    if (!row || row.userId !== userId) return null;
    return structuredClone(row);
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getLocalDb().claims.get(claimId);
    if (!row || row.userId !== userId) return null;
    return structuredClone(row);
  }
  const { data, error } = await client
    .from(SIDE_EFFECT_TABLE)
    .select("*")
    .eq("id", claimId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingError(error.message)) return null;
    throw new Error(`[side-effects] get failed: ${error.message}`);
  }
  return data ? fromRow(data as ClaimRow) : null;
}

export async function getSideEffectClaimByKeyForUser(
  userId: string,
  idempotencyKey: string,
): Promise<SideEffectClaim | null> {
  if (await shouldUseLocalStandIn()) {
    const id = getLocalDb().byUserKey.get(userKey(userId, idempotencyKey));
    if (!id) return null;
    return getSideEffectClaimForUser(id, userId);
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const { data, error } = await client
    .from(SIDE_EFFECT_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) {
    if (isMissingError(error.message)) return null;
    throw new Error(`[side-effects] get-by-key failed: ${error.message}`);
  }
  return data ? fromRow(data as ClaimRow) : null;
}

async function persistClaim(claim: SideEffectClaim): Promise<SideEffectClaim> {
  if (await shouldUseLocalStandIn()) {
    const db = getLocalDb();
    if (db.claims.get(claim.id)?.userId !== claim.userId && db.claims.has(claim.id)) {
      throw new Error("[side-effects] ownership violation on persist");
    }
    db.claims.set(claim.id, structuredClone(claim));
    db.byUserKey.set(userKey(claim.userId, claim.idempotencyKey), claim.id);
    return structuredClone(claim);
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      throw new Error("[side-effects] DB SoT unavailable for persist");
    }
    getLocalDb().claims.set(claim.id, structuredClone(claim));
    return structuredClone(claim);
  }
  const { error } = await client
    .from(SIDE_EFFECT_TABLE)
    .upsert(toRow(claim), { onConflict: "id" });
  if (error) {
    if (isMissingError(error.message)) {
      markSideEffectIdempotencyReadyUnknown();
      if (isAtlasProduction()) throw new Error(error.message);
      getLocalDb().claims.set(claim.id, structuredClone(claim));
      return structuredClone(claim);
    }
    throw new Error(`[side-effects] persist failed: ${error.message}`);
  }
  return structuredClone(claim);
}

export async function markSideEffectSucceeded(input: {
  claimId: string;
  userId: string;
  providerResourceId: string;
  providerRequestId?: string | null;
  evidence?: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
}): Promise<SideEffectClaim> {
  const current = await getSideEffectClaimForUser(input.claimId, input.userId);
  if (!current) throw new Error("[side-effects] claim not found");
  const now = new Date().toISOString();
  return persistClaim({
    ...current,
    status: "succeeded",
    providerResourceId: input.providerResourceId,
    providerRequestId: input.providerRequestId ?? current.providerRequestId,
    evidence: { ...current.evidence, ...(input.evidence ?? {}) },
    resultPayload: input.resultPayload ?? current.resultPayload,
    leaseOwner: null,
    leaseExpiresAt: null,
    completedAt: now,
    updatedAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export async function markSideEffectFailed(input: {
  claimId: string;
  userId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<SideEffectClaim> {
  const current = await getSideEffectClaimForUser(input.claimId, input.userId);
  if (!current) throw new Error("[side-effects] claim not found");
  const now = new Date().toISOString();
  return persistClaim({
    ...current,
    status: "failed",
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: input.errorCode,
    lastErrorMessage: input.errorMessage.slice(0, 500),
    updatedAt: now,
    completedAt: null,
  });
}

export async function markSideEffectUnknownOutcome(input: {
  claimId: string;
  userId: string;
  errorCode: string;
  errorMessage: string;
  evidence?: Record<string, unknown>;
}): Promise<SideEffectClaim> {
  const current = await getSideEffectClaimForUser(input.claimId, input.userId);
  if (!current) throw new Error("[side-effects] claim not found");
  const now = new Date().toISOString();
  return persistClaim({
    ...current,
    status: "unknown_outcome",
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: input.errorCode,
    lastErrorMessage: input.errorMessage.slice(0, 500),
    evidence: { ...current.evidence, ...(input.evidence ?? {}) },
    completedAt: now,
    updatedAt: now,
  });
}

/** Test-only: force a processing row with expired lease (crash simulation). */
export async function forceSideEffectProcessingForTests(input: {
  claimId: string;
  userId: string;
  leaseExpiredMsAgo?: number;
  providerResourceId?: string | null;
}): Promise<SideEffectClaim> {
  const current = await getSideEffectClaimForUser(input.claimId, input.userId);
  if (!current) throw new Error("missing claim");
  const expired = new Date(
    Date.now() - (input.leaseExpiredMsAgo ?? 120_000),
  ).toISOString();
  return persistClaim({
    ...current,
    status: "processing",
    leaseOwner: "crashed_worker",
    leaseExpiresAt: expired,
    providerResourceId: input.providerResourceId ?? null,
    updatedAt: new Date().toISOString(),
  });
}
