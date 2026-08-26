/**
 * Production usage SoT: public.atlas_billing_usage_counters.
 * Process memory is a cache filled after a successful durable read.
 */

import {
  hashOpaqueKey,
  logBillingUsagePersistenceSummary,
} from "@/lib/health/probe-observability";
import {
  buildDurableReadDiagnosticId,
  logDurableReadFailure,
  readUnknownSupabaseError,
} from "@/lib/persistence/durable-read-log";
import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { isSupabaseRelationMissingError } from "@/lib/automations/supabase-error";

import {
  ATLAS_INCREMENT_USAGE_RPC_NAME,
  buildIncrementUsageRpcArgs,
} from "./increment-once-sql";
import {
  ensureBillingUsageIncrementRpc,
  isMissingUsageIncrementRpc,
} from "./increment-rpc-probe";
import { getUsageMonthKey } from "./period";
import {
  getUsageSnapshot,
  incrementUsageCounterOnce,
  saveUsageSnapshot,
} from "./store";
import { asUntypedSupabase } from "./untyped-supabase";
import type { UsageCounters } from "./types";

export type UsageMeterId =
  | "ai_runs"
  | "sns_posts"
  | "x_url_posts"
  | "wordpress_posts";

export type DurableUsageCounters = {
  aiRuns: number;
  snsPosts: number;
  xUrlPosts: number;
  wordpressPosts: number;
};

export type DurableUsageLoad = {
  counters: DurableUsageCounters;
  ready: boolean;
  error: string | null;
};

export type DurableIncrementResult = {
  ok: boolean;
  incremented: boolean;
  used: number;
  ready: boolean;
  source: "durable" | "memory";
};

const METER_TO_COUNTER: Record<UsageMeterId, keyof UsageCounters> = {
  ai_runs: "aiRuns",
  sns_posts: "snsPosts",
  x_url_posts: "xUrlPosts",
  wordpress_posts: "wordpressPosts",
};

function emptyCounters(): DurableUsageCounters {
  return { aiRuns: 0, snsPosts: 0, xUrlPosts: 0, wordpressPosts: 0 };
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asIncrementRow(data: unknown): {
  ok?: boolean;
  incremented?: boolean;
  idempotent?: boolean;
  used?: unknown;
} | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as {
    ok?: boolean;
    incremented?: boolean;
    idempotent?: boolean;
    used?: unknown;
  };
}

export function applyDurableCountersToMemory(
  userId: string,
  month: string,
  counters: DurableUsageCounters,
): void {
  const current = getUsageSnapshot(userId, month);
  saveUsageSnapshot({
    ...current,
    userId,
    month,
    aiRuns: counters.aiRuns,
    snsPosts: counters.snsPosts,
    xUrlPosts: counters.xUrlPosts,
    wordpressPosts: counters.wordpressPosts,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadDurableUsageCounters(
  userId: string,
  month: string = getUsageMonthKey(),
): Promise<DurableUsageLoad> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      logDurableReadFailure({
        endpoint: "/api/billing/summary",
        userId,
        code: "supabase_service_role_not_configured",
        databaseCode: null,
        table: "atlas_billing_usage_counters",
        diagnosticId: buildDurableReadDiagnosticId("usage_env"),
        message: "service_role_missing",
      });
      return {
        counters: emptyCounters(),
        ready: false,
        error: "usage_unavailable",
      };
    }
    const snapshot = getUsageSnapshot(userId, month);
    return {
      counters: {
        aiRuns: snapshot.aiRuns,
        snsPosts: snapshot.snsPosts,
        xUrlPosts: snapshot.xUrlPosts,
        wordpressPosts: snapshot.wordpressPosts,
      },
      ready: true,
      error: null,
    };
  }

  const { data, error } = await asUntypedSupabase(client)
    .from("atlas_billing_usage_counters")
    .select("ai_runs, sns_posts, x_url_posts, wordpress_posts")
    .eq("user_id", userId)
    .eq("month_key", month)
    .maybeSingle();

  if (error) {
    const parsed = readUnknownSupabaseError(error);
    logDurableReadFailure({
      endpoint: "/api/billing/summary",
      userId,
      code: isSupabaseRelationMissingError({
        code: parsed.code ?? undefined,
        message: parsed.message,
      })
        ? "usage_schema_missing"
        : "usage_read_failed",
      databaseCode: parsed.code,
      table: "atlas_billing_usage_counters",
      diagnosticId: buildDurableReadDiagnosticId("usage_counters"),
      message: parsed.message,
    });
    return {
      counters: emptyCounters(),
      ready: false,
      error: "usage_unavailable",
    };
  }

  const counters: DurableUsageCounters = {
    aiRuns: asCount(data?.ai_runs),
    snsPosts: asCount(data?.sns_posts),
    xUrlPosts: asCount(data?.x_url_posts),
    wordpressPosts: asCount(data?.wordpress_posts),
  };
  applyDurableCountersToMemory(userId, month, counters);
  return { counters, ready: true, error: null };
}

export async function incrementDurableUsageOnce(input: {
  userId: string;
  claimKey: string;
  meter: UsageMeterId;
  amount?: number;
  month?: string;
}): Promise<DurableIncrementResult> {
  const started = Date.now();
  const month = input.month ?? getUsageMonthKey();
  const claimKey = input.claimKey.trim();
  const amount = Math.max(1, input.amount ?? 1);
  const counter = METER_TO_COUNTER[input.meter];
  const claimKeyHash = hashOpaqueKey(claimKey || "empty");
  if (!input.userId.trim() || !claimKey) {
    logBillingUsagePersistenceSummary({
      claimKeyHash,
      meter: input.meter,
      persisted: false,
      deduplicated: false,
      durationMs: Date.now() - started,
      errorCode: "usage_invalid_claim",
    });
    return {
      ok: false,
      incremented: false,
      used: getUsageSnapshot(input.userId, month)[counter],
      ready: false,
      source: "memory",
    };
  }

  const client = createServiceRoleClientIfConfigured();
  if (client) {
    const args = buildIncrementUsageRpcArgs({
      userId: input.userId,
      monthKey: month,
      claimKey,
      meter: input.meter,
      amount,
    });
    let { data, error } = await asUntypedSupabase(client).rpc(
      ATLAS_INCREMENT_USAGE_RPC_NAME,
      args,
    );
    if (error && isMissingUsageIncrementRpc(error)) {
      const ensured = await ensureBillingUsageIncrementRpc();
      if (ensured.ok) {
        ({ data, error } = await asUntypedSupabase(client).rpc(
          ATLAS_INCREMENT_USAGE_RPC_NAME,
          args,
        ));
      }
    }
    const row = !error ? asIncrementRow(data) : null;
    if (row) {
      const used = asCount(row.used);
      const incremented = Boolean(row.incremented) && !row.idempotent;
      const current = getUsageSnapshot(input.userId, month);
      saveUsageSnapshot({
        ...current,
        userId: input.userId,
        month,
        [counter]: used,
        updatedAt: new Date().toISOString(),
      });
      logBillingUsagePersistenceSummary({
        claimKeyHash,
        meter: input.meter,
        persisted: Boolean(row.ok),
        deduplicated: Boolean(row.idempotent) || !incremented,
        durationMs: Date.now() - started,
        errorCode: row.ok ? null : "usage_increment_failed",
      });
      return {
        ok: Boolean(row.ok),
        incremented,
        used,
        ready: true,
        source: "durable",
      };
    }
    if (isAtlasProduction()) {
      const parsed = readUnknownSupabaseError(error);
      const errorCode = isMissingUsageIncrementRpc(error)
        ? "usage_rpc_missing"
        : "usage_increment_failed";
      logDurableReadFailure({
        endpoint: "/api/billing/usage",
        userId: input.userId,
        code: errorCode,
        databaseCode: parsed.code,
        table: "atlas_billing_usage_counters",
        diagnosticId: buildDurableReadDiagnosticId("usage_increment"),
        message: parsed.message,
      });
      logBillingUsagePersistenceSummary({
        claimKeyHash,
        meter: input.meter,
        persisted: false,
        deduplicated: false,
        durationMs: Date.now() - started,
        errorCode,
      });
      return {
        ok: false,
        incremented: false,
        used: getUsageSnapshot(input.userId, month)[counter],
        ready: false,
        source: "durable",
      };
    }
  } else if (isAtlasProduction()) {
    logBillingUsagePersistenceSummary({
      claimKeyHash,
      meter: input.meter,
      persisted: false,
      deduplicated: false,
      durationMs: Date.now() - started,
      errorCode: "usage_unavailable",
    });
    return {
      ok: false,
      incremented: false,
      used: 0,
      ready: false,
      source: "durable",
    };
  }

  const once = incrementUsageCounterOnce(
    input.userId,
    counter,
    claimKey,
    amount,
    month,
  );
  logBillingUsagePersistenceSummary({
    claimKeyHash,
    meter: input.meter,
    persisted: true,
    deduplicated: !once.incremented,
    durationMs: Date.now() - started,
    errorCode: null,
  });
  return {
    ok: true,
    incremented: once.incremented,
    used: once.snapshot[counter],
    ready: true,
    source: "memory",
  };
}

export async function syncAiRunsFromClaims(
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
  let { data, error } = await asUntypedSupabase(client).rpc(
    "atlas_sync_ai_runs_from_claims",
    {
      p_user_id: userId,
      p_month_key: month,
    },
  );
  if (error && isMissingUsageIncrementRpc(error)) {
    const ensured = await ensureBillingUsageIncrementRpc();
    if (ensured.ok) {
      ({ data, error } = await asUntypedSupabase(client).rpc(
        "atlas_sync_ai_runs_from_claims",
        {
          p_user_id: userId,
          p_month_key: month,
        },
      ));
    }
  }
  if (error || !data || typeof data !== "object") {
    return { used: 0, ready: false };
  }
  const used = asCount((data as { used?: number }).used);
  const current = getUsageSnapshot(userId, month);
  saveUsageSnapshot({
    ...current,
    userId,
    month,
    aiRuns: used,
    updatedAt: new Date().toISOString(),
  });
  return { used, ready: true };
}
