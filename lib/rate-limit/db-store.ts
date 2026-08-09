/**
 * P1-06: Distributed rate limit DB Single Source of Truth.
 * Process memory is a non-production stand-in only — never Production SoT.
 */

import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { RATE_LIMIT_RPC, RATE_LIMIT_TABLE } from "./migration-sql";
import { parseConsumeRateLimitRpcData } from "./parse-consume";
import {
  isDistributedRateLimitReady,
  markDistributedRateLimitReadyUnknown,
  setDistributedRateLimitReadyForTests,
} from "./table-ready";

export type RateLimitOptions = {
  bucket: string;
  max: number;
  windowMs: number;
  minIntervalMs?: number;
};

export type RateLimitConsumeResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  hitCount: number;
  backend: "db" | "local_stand_in";
};

type LocalCounter = {
  windowStartedMs: number;
  hitCount: number;
  lastHitAtMs: number;
  windowMs: number;
};

type LocalDb = {
  counters: Map<string, LocalCounter>;
};

function getLocalDb(): LocalDb {
  const scope = globalThis as typeof globalThis & {
    __atlasDistributedRateLimitLocal?: LocalDb;
  };
  if (!scope.__atlasDistributedRateLimitLocal) {
    scope.__atlasDistributedRateLimitLocal = { counters: new Map() };
  }
  return scope.__atlasDistributedRateLimitLocal;
}

function forceMemory(): boolean {
  return (
    process.env.ATLAS_RATE_LIMIT_FORCE_MEMORY?.trim().toLowerCase() === "true"
  );
}

export function resetDistributedRateLimitStoreForTests(): void {
  getLocalDb().counters.clear();
  setDistributedRateLimitReadyForTests(true);
}

function isMissingError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the (table|function)|function .* does not exist/i.test(
        message,
      ),
  );
}

async function shouldUseLocalStandIn(): Promise<boolean> {
  if (forceMemory() && !isAtlasProduction()) return true;
  if (isAtlasProduction()) return false;
  const ready = await isDistributedRateLimitReady();
  if (ready && createServiceRoleClientIfConfigured()) return false;
  setDistributedRateLimitReadyForTests(true);
  return true;
}

function consumeLocal(
  subjectKey: string,
  options: RateLimitOptions,
  nowMs = Date.now(),
): RateLimitConsumeResult {
  const windowMs = Math.max(1, options.windowMs);
  const max = Math.max(0, options.max);
  const minInterval = Math.max(0, options.minIntervalMs ?? 0);
  const windowStartedMs = Math.floor(nowMs / windowMs) * windowMs;
  const id = `${options.bucket}:${subjectKey}:${windowStartedMs}`;
  const db = getLocalDb();
  const current = db.counters.get(id) ?? {
    windowStartedMs,
    hitCount: 0,
    lastHitAtMs: 0,
    windowMs,
  };

  if (current.lastHitAtMs > 0 && minInterval > 0) {
    const elapsed = nowMs - current.lastHitAtMs;
    if (elapsed < minInterval) {
      return {
        allowed: false,
        remaining: Math.max(max - current.hitCount, 0),
        retryAfterMs: Math.max(minInterval - elapsed, 1),
        hitCount: current.hitCount,
        backend: "local_stand_in",
      };
    }
  }

  if (current.hitCount >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(windowStartedMs + windowMs - nowMs, 1),
      hitCount: current.hitCount,
      backend: "local_stand_in",
    };
  }

  current.hitCount += 1;
  current.lastHitAtMs = nowMs;
  current.windowMs = windowMs;
  db.counters.set(id, current);
  return {
    allowed: true,
    remaining: Math.max(max - current.hitCount, 0),
    retryAfterMs: 0,
    hitCount: current.hitCount,
    backend: "local_stand_in",
  };
}

/**
 * Atomic check+record. Production uses DB RPC; tests/non-prod may use local stand-in.
 * Production without DB SoT fails closed (denies) to prevent cost explosion.
 */
export async function consumeRateLimit(
  subjectKey: string,
  options: RateLimitOptions,
): Promise<RateLimitConsumeResult> {
  if (!subjectKey.trim()) {
    throw new Error("[rate-limit] subjectKey required");
  }
  if (!options.bucket.trim()) {
    throw new Error("[rate-limit] bucket required");
  }

  if (await shouldUseLocalStandIn()) {
    return consumeLocal(subjectKey, options);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: 5_000,
        hitCount: 0,
        backend: "db",
      };
    }
    return consumeLocal(subjectKey, options);
  }

  const { data, error } = await client.rpc(RATE_LIMIT_RPC, {
    p_bucket: options.bucket,
    p_subject_key: subjectKey,
    p_max: options.max,
    p_window_ms: options.windowMs,
    p_min_interval_ms: options.minIntervalMs ?? 0,
  });

  if (error) {
    if (isMissingError(error.message)) {
      markDistributedRateLimitReadyUnknown();
      if (isAtlasProduction()) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: 15_000,
          hitCount: 0,
          backend: "db",
        };
      }
      return consumeLocal(subjectKey, options);
    }
    if (isAtlasProduction()) {
      console.error("[rate-limit] consume RPC failed (fail-closed):", error.message);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: 5_000,
        hitCount: 0,
        backend: "db",
      };
    }
    return consumeLocal(subjectKey, options);
  }

  const parsed = parseConsumeRateLimitRpcData(data);
  if (!parsed) {
    if (isAtlasProduction()) {
      console.error("[rate-limit] consume RPC unexpected payload (fail-closed)");
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: 5_000,
        hitCount: 0,
        backend: "db",
      };
    }
    return consumeLocal(subjectKey, options);
  }
  return {
    allowed: parsed.allowed,
    remaining: parsed.remaining,
    retryAfterMs: parsed.retryAfterMs,
    hitCount: parsed.hitCount,
    backend: "db",
  };
}

/** Read-only peek for probes/tests (not used for enforcement). */
export async function countLocalStandInEntries(): Promise<number> {
  return getLocalDb().counters.size;
}

export function getRateLimitTableName(): string {
  return RATE_LIMIT_TABLE;
}
