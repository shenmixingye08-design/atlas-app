/**
 * Atomic AI-job quota. One top-level user job = 1 run.
 * Memory is a cache; Supabase RPC is Production SoT when configured.
 */

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { getUsageMonthKey } from "./period";
import { asUntypedSupabase } from "./untyped-supabase";
import {
  getUsageSnapshot,
  incrementUsageCounter,
  incrementUsageCounterOnce,
  saveUsageSnapshot,
} from "./store";

export type AiQuotaReserveResult =
  | {
      ok: true;
      used: number;
      limit: number;
      idempotent: boolean;
      source: "durable" | "memory";
    }
  | {
      ok: false;
      used: number;
      limit: number;
      reason: "limit_reached" | "usage_unavailable";
      source: "durable" | "memory";
    };

type MemoryClaim = { userId: string; month: string; amount: number };

function memoryClaims(): Map<string, MemoryClaim> {
  const scope = globalThis as typeof globalThis & {
    __atlasAiQuotaClaims?: Map<string, MemoryClaim>;
  };
  if (!scope.__atlasAiQuotaClaims) {
    scope.__atlasAiQuotaClaims = new Map();
  }
  return scope.__atlasAiQuotaClaims;
}

const lockTails = new Map<string, Promise<void>>();

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = lockTails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  lockTails.set(
    userId,
    prev.then(() => next),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (lockTails.get(userId) === next) {
      lockTails.delete(userId);
    }
  }
}

function reserveInMemory(input: {
  userId: string;
  month: string;
  claimKey: string;
  limit: number;
  amount: number;
}): AiQuotaReserveResult {
  const claims = memoryClaims();
  const existing = claims.get(input.claimKey);
  if (existing && existing.userId === input.userId && existing.month === input.month) {
    const snapshot = getUsageSnapshot(input.userId, input.month);
    return {
      ok: true,
      used: snapshot.aiRuns,
      limit: input.limit,
      idempotent: true,
      source: "memory",
    };
  }

  const current = getUsageSnapshot(input.userId, input.month);
  if (current.aiRuns + input.amount > input.limit) {
    return {
      ok: false,
      used: current.aiRuns,
      limit: input.limit,
      reason: "limit_reached",
      source: "memory",
    };
  }

  const once = incrementUsageCounterOnce(
    input.userId,
    "aiRuns",
    input.claimKey,
    input.amount,
    input.month,
  );
  claims.set(input.claimKey, {
    userId: input.userId,
    month: input.month,
    amount: input.amount,
  });
  return {
    ok: true,
    used: once.snapshot.aiRuns,
    limit: input.limit,
    idempotent: !once.incremented,
    source: "memory",
  };
}

async function reserveInSupabase(input: {
  userId: string;
  month: string;
  claimKey: string;
  limit: number;
  amount: number;
}): Promise<AiQuotaReserveResult | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  const { data, error } = await asUntypedSupabase(client).rpc("atlas_reserve_ai_run", {
    p_user_id: input.userId,
    p_month_key: input.month,
    p_claim_key: input.claimKey,
    p_limit: input.limit,
    p_amount: input.amount,
  });
  if (error || !data || typeof data !== "object") {
    return null;
  }
  const row = data as {
    ok?: boolean;
    used?: number;
    limit?: number;
    idempotent?: boolean;
    reason?: string;
  };
  const used = typeof row.used === "number" ? row.used : 0;
  saveUsageSnapshot({
    ...getUsageSnapshot(input.userId, input.month),
    userId: input.userId,
    month: input.month,
    aiRuns: used,
    updatedAt: new Date().toISOString(),
  });
  if (row.ok) {
    return {
      ok: true,
      used,
      limit: input.limit,
      idempotent: Boolean(row.idempotent),
      source: "durable",
    };
  }
  return {
    ok: false,
    used,
    limit: input.limit,
    reason: "limit_reached",
    source: "durable",
  };
}

export async function reserveAiJobQuota(input: {
  userId: string;
  claimKey: string;
  limit: number;
  amount?: number;
  month?: string;
}): Promise<AiQuotaReserveResult> {
  const month = input.month ?? getUsageMonthKey();
  const amount = Math.max(1, input.amount ?? 1);
  const claimKey = input.claimKey.trim();
  if (!input.userId.trim() || !claimKey) {
    return {
      ok: false,
      used: 0,
      limit: input.limit,
      reason: "usage_unavailable",
      source: "memory",
    };
  }

  return withUserLock(input.userId, async () => {
    const durable = await reserveInSupabase({
      userId: input.userId,
      month,
      claimKey,
      limit: input.limit,
      amount,
    });
    if (durable) return durable;
    if (isAtlasProduction()) {
      return {
        ok: false,
        used: getUsageSnapshot(input.userId, month).aiRuns,
        limit: input.limit,
        reason: "usage_unavailable",
        source: "memory",
      };
    }
    return reserveInMemory({
      userId: input.userId,
      month,
      claimKey,
      limit: input.limit,
      amount,
    });
  });
}

export async function loadDurableAiRuns(
  userId: string,
  month: string = getUsageMonthKey(),
): Promise<{ used: number; ready: boolean }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      used: getUsageSnapshot(userId, month).aiRuns,
      ready: !isAtlasProduction(),
    };
  }
  const { data, error } = await asUntypedSupabase(client)
    .from("atlas_billing_usage_counters")
    .select("ai_runs")
    .eq("user_id", userId)
    .eq("month_key", month)
    .maybeSingle();
  if (error) {
    return { used: 0, ready: false };
  }
  const used = typeof data?.ai_runs === "number" ? data.ai_runs : 0;
  const current = getUsageSnapshot(userId, month);
  if (used !== current.aiRuns) {
    saveUsageSnapshot({
      ...current,
      aiRuns: Math.max(used, current.aiRuns),
      updatedAt: new Date().toISOString(),
    });
  }
  return { used: Math.max(used, current.aiRuns), ready: true };
}

export function resetAiQuotaEngineForTests(): void {
  memoryClaims().clear();
  lockTails.clear();
}

/** Test helper: set used count without going through OpenAI. */
export function seedAiRunsForTests(
  userId: string,
  used: number,
  month: string = getUsageMonthKey(),
): void {
  const current = getUsageSnapshot(userId, month);
  saveUsageSnapshot({
    ...current,
    aiRuns: used,
    updatedAt: new Date().toISOString(),
  });
}

export { incrementUsageCounter };
