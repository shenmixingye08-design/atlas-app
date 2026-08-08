/**
 * P1-04: Execute an external side effect at-most-once via durable claim.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  claimSideEffect,
  ensureSideEffectClaim,
  getSideEffectClaimForUser,
  markSideEffectFailed,
  markSideEffectSucceeded,
  markSideEffectUnknownOutcome,
  SIDE_EFFECT_LEASE_MS,
} from "./store";
import { isSideEffectIdempotencyReady } from "./table-ready";
import type {
  SideEffectClaim,
  SideEffectContext,
  SideEffectExecuteResult,
} from "./types";
import {
  SideEffectFailClosedError,
  SideEffectLostRaceError,
} from "./types";

export type SideEffectActionOutcome<T> = {
  /** Opaque provider resource id (tweet id, message id, event id, file id…). */
  providerResourceId: string;
  providerRequestId?: string | null;
  evidence?: Record<string, unknown>;
  /** Serializable result cached for reuse after success. */
  result: T;
};

function restoreCachedResult<T>(
  payload: Record<string, unknown>,
  restoreResult?: (payload: Record<string, unknown>) => T,
): T {
  if (restoreResult) return restoreResult(payload);
  if (payload && "value" in payload) return payload.value as T;
  return payload as T;
}

function isAmbiguousProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = `${error.name} ${error.message}`.toLowerCase();
  return (
    /timeout|timed out|econnreset|econnaborted|network|fetch failed|socket|aborted|und_err|499|502|503|504|unknown_outcome|ambiguous/i.test(
      msg,
    ) || error.name === "AbortError"
  );
}

function classifyError(error: unknown): { code: string; message: string } {
  if (error instanceof SideEffectFailClosedError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    const statusMatch = error.message.match(/\b([45]\d\d)\b/);
    if (statusMatch?.[1] === "429") {
      return { code: "provider_rate_limited", message: error.message };
    }
    if (statusMatch?.[1]?.startsWith("5")) {
      return { code: "provider_server_error", message: error.message };
    }
    return { code: error.name || "provider_error", message: error.message };
  }
  return { code: "provider_error", message: "unknown provider error" };
}

async function assertReadyOrThrow(): Promise<void> {
  if (!isAtlasProduction()) return;
  const ready = await isSideEffectIdempotencyReady();
  if (!ready) {
    throw new SideEffectFailClosedError(
      "side_effect_schema_missing",
      "副作用冪等テーブルが未適用のため外部副作用を実行できません",
    );
  }
}

/**
 * Run `action` at most once for the logical side-effect identity in `ctx`.
 *
 * - Concurrent workers: single winner via durable claim
 * - Prior success: reuse cached result (no provider call)
 * - unknown_outcome: fail-closed (no re-send)
 * - Stale processing without resource id: fail-closed (crash-after-success)
 * - Clear failures (429/500): mark failed and allow later retry
 */
export async function executeIdempotentSideEffect<T>(
  ctx: SideEffectContext,
  action: () => Promise<SideEffectActionOutcome<T>>,
  options?: {
    leaseOwner?: string;
    leaseMs?: number;
    /** Optional deserializer when reusing succeeded payload. */
    restoreResult?: (payload: Record<string, unknown>) => T;
  },
): Promise<SideEffectExecuteResult<T>> {
  await assertReadyOrThrow();

  const ensured = await ensureSideEffectClaim(ctx);
  if (ensured.userId !== ctx.userId) {
    throw new SideEffectFailClosedError(
      "side_effect_forbidden",
      "他ユーザーの副作用claimは利用できません",
      ensured,
    );
  }

  if (ensured.status === "succeeded") {
    const restored = restoreCachedResult(
      ensured.resultPayload,
      options?.restoreResult,
    );
    return {
      result: restored,
      claim: ensured,
      executed: false,
      reused: true,
    };
  }

  if (ensured.status === "unknown_outcome") {
    throw new SideEffectFailClosedError(
      "side_effect_unknown_outcome",
      "前回の副作用結果が不明なため再実行しません",
      ensured,
    );
  }

  const leaseOwner = options?.leaseOwner ?? `sef_${randomUUID().slice(0, 10)}`;
  const claimed = await claimSideEffect({
    claimId: ensured.id,
    userId: ctx.userId,
    leaseOwner,
    leaseMs: options?.leaseMs ?? SIDE_EFFECT_LEASE_MS,
  });

  if (!claimed || claimed.userId !== ctx.userId) {
    throw new SideEffectFailClosedError(
      "side_effect_claim_failed",
      "副作用claimに失敗しました",
    );
  }

  if (claimed.status === "succeeded") {
    const restored = restoreCachedResult(
      claimed.resultPayload,
      options?.restoreResult,
    );
    return {
      result: restored,
      claim: claimed,
      executed: false,
      reused: true,
    };
  }

  if (claimed.status === "unknown_outcome") {
    throw new SideEffectFailClosedError(
      "side_effect_unknown_outcome",
      claimed.lastErrorMessage ??
        "stale processing / ambiguous outcome — 再実行禁止",
      claimed,
    );
  }

  if (
    claimed.status === "processing" &&
    claimed.leaseOwner &&
    claimed.leaseOwner !== leaseOwner
  ) {
    throw new SideEffectLostRaceError(claimed);
  }

  if (claimed.status !== "processing" || claimed.leaseOwner !== leaseOwner) {
    throw new SideEffectLostRaceError(claimed);
  }

  try {
    const outcome = await action();
    if (!outcome.providerResourceId?.trim()) {
      const unknown = await markSideEffectUnknownOutcome({
        claimId: claimed.id,
        userId: ctx.userId,
        errorCode: "missing_provider_resource_id",
        errorMessage: "provider resource id missing after action",
      });
      throw new SideEffectFailClosedError(
        "missing_provider_resource_id",
        "副作用の成果物IDが取得できませんでした",
        unknown,
      );
    }

    const saved = await markSideEffectSucceeded({
      claimId: claimed.id,
      userId: ctx.userId,
      providerResourceId: outcome.providerResourceId,
      providerRequestId: outcome.providerRequestId ?? null,
      evidence: outcome.evidence,
      resultPayload: { value: outcome.result as unknown },
    });

    return {
      result: outcome.result,
      claim: saved,
      executed: true,
      reused: false,
    };
  } catch (error) {
    if (error instanceof SideEffectFailClosedError) throw error;
    if (error instanceof SideEffectLostRaceError) throw error;

    const classified = classifyError(error);
    if (isAmbiguousProviderError(error)) {
      const unknown = await markSideEffectUnknownOutcome({
        claimId: claimed.id,
        userId: ctx.userId,
        errorCode: classified.code,
        errorMessage: classified.message,
        evidence: { ambiguous: true },
      });
      throw new SideEffectFailClosedError(
        "side_effect_unknown_outcome",
        "副作用結果が判定不能なため再送しません",
        unknown,
      );
    }

    await markSideEffectFailed({
      claimId: claimed.id,
      userId: ctx.userId,
      errorCode: classified.code,
      errorMessage: classified.message,
    });
    throw error;
  }
}

export async function readSideEffectClaim(
  claimId: string,
  userId: string,
): Promise<SideEffectClaim | null> {
  return getSideEffectClaimForUser(claimId, userId);
}
