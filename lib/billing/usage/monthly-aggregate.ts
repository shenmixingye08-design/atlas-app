/**
 * Monthly AI cost aggregates, independent of the 5000-event detail log.
 * In-memory cache is never trimmed. Durable SoT is the increment RPC.
 */

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { getUsageMonthKey } from "./period";
import type { AiUsageEvent, AiUsagePeriodSummary } from "./types";

export type MonthlyAiAggregateRow = {
  userId: string;
  month: string;
  model: string;
  feature: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  updatedAt: string;
};

export type MonthlyAiAggregateKey = `${string}::${string}::${string}::${string}`;

function aggregateKey(
  userId: string,
  month: string,
  model: string,
  feature: string,
): MonthlyAiAggregateKey {
  return `${userId}::${month}::${model}::${feature}`;
}

function getAggregateBucket(): Map<MonthlyAiAggregateKey, MonthlyAiAggregateRow> {
  const scope = globalThis as typeof globalThis & {
    __atlasBillingAiMonthlyAggregates?: Map<
      MonthlyAiAggregateKey,
      MonthlyAiAggregateRow
    >;
  };
  if (!scope.__atlasBillingAiMonthlyAggregates) {
    scope.__atlasBillingAiMonthlyAggregates = new Map();
  }
  return scope.__atlasBillingAiMonthlyAggregates;
}

function emptyPeriod(): AiUsagePeriodSummary {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

export function incrementMonthlyAiAggregateMemory(
  input: {
    userId: string;
    month?: string;
    model: string;
    feature: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    timestamp?: string;
  },
): MonthlyAiAggregateRow {
  const month =
    input.month ??
    (input.timestamp
      ? getUsageMonthKey(new Date(input.timestamp))
      : getUsageMonthKey());
  const key = aggregateKey(input.userId, month, input.model, input.feature);
  const bucket = getAggregateBucket();
  const current = bucket.get(key);
  const next: MonthlyAiAggregateRow = {
    userId: input.userId,
    month,
    model: input.model,
    feature: input.feature,
    requests: (current?.requests ?? 0) + Math.max(0, input.requests),
    inputTokens: (current?.inputTokens ?? 0) + Math.max(0, input.inputTokens),
    outputTokens: (current?.outputTokens ?? 0) + Math.max(0, input.outputTokens),
    costUsd: (current?.costUsd ?? 0) + Math.max(0, input.costUsd),
    updatedAt: new Date().toISOString(),
  };
  bucket.set(key, next);
  return next;
}

export function incrementMonthlyAiAggregateFromEvent(event: AiUsageEvent): MonthlyAiAggregateRow {
  return incrementMonthlyAiAggregateMemory({
    userId: event.userId,
    timestamp: event.timestamp,
    model: event.model,
    feature: event.feature,
    requests: event.requestCount,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    costUsd: event.estimatedCostUsd,
  });
}

export function listMonthlyAiAggregates(): MonthlyAiAggregateRow[] {
  return [...getAggregateBucket().values()];
}

export function serializeMonthlyAiAggregates(): Record<string, MonthlyAiAggregateRow> {
  return Object.fromEntries(getAggregateBucket().entries());
}

export function replaceMonthlyAiAggregates(
  rows: Record<string, MonthlyAiAggregateRow> | readonly MonthlyAiAggregateRow[],
): void {
  const bucket = getAggregateBucket();
  bucket.clear();
  const list = Array.isArray(rows) ? rows : Object.values(rows);
  for (const row of list) {
    if (!row?.userId || !row.month) continue;
    bucket.set(aggregateKey(row.userId, row.month, row.model, row.feature), {
      userId: row.userId,
      month: row.month,
      model: row.model ?? "",
      feature: row.feature ?? "",
      requests: row.requests ?? 0,
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      costUsd: row.costUsd ?? 0,
      updatedAt: row.updatedAt || new Date().toISOString(),
    });
  }
}

export function resetMonthlyAiAggregates(): void {
  getAggregateBucket().clear();
}

export function summarizeMonthlyAiAggregates(
  month: string,
): AiUsagePeriodSummary {
  const summary = emptyPeriod();
  for (const row of getAggregateBucket().values()) {
    if (row.month !== month) continue;
    summary.requests += row.requests;
    summary.inputTokens += row.inputTokens;
    summary.outputTokens += row.outputTokens;
    summary.totalTokens += row.inputTokens + row.outputTokens;
    summary.estimatedCostUsd += row.costUsd;
  }
  return summary;
}

type UntypedClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
    };
  };
};

export async function persistMonthlyAiAggregateIncrement(input: {
  userId: string;
  month: string;
  model: string;
  feature: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;
  const { error } = await (client as unknown as UntypedClient).rpc(
    "atlas_increment_ai_monthly",
    {
      p_user_id: input.userId,
      p_month_key: input.month,
      p_model: input.model,
      p_feature: input.feature,
      p_requests: input.requests,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_cost_usd: input.costUsd,
    },
  );
  return !error;
}

export async function loadMonthlyAiAggregatesFromDurable(
  month: string,
): Promise<{
  ready: boolean;
  summary: AiUsagePeriodSummary | null;
  rows: MonthlyAiAggregateRow[];
}> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ready: false,
      summary: null,
      rows: listMonthlyAiAggregates().filter((row) => row.month === month),
    };
  }

  const { data, error } = await (client as unknown as UntypedClient)
    .from("atlas_billing_ai_monthly")
    .select(
      "user_id, month_key, model, feature, requests, input_tokens, output_tokens, cost_usd, updated_at",
    )
    .eq("month_key", month);

  if (error || !Array.isArray(data)) {
    return { ready: false, summary: null, rows: [] };
  }

  const rows: MonthlyAiAggregateRow[] = data.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      userId: String(row.user_id ?? ""),
      month: String(row.month_key ?? month),
      model: String(row.model ?? ""),
      feature: String(row.feature ?? ""),
      requests: Number(row.requests ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      costUsd: Number(row.cost_usd ?? 0),
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
    };
  });

  if (rows.length > 0) {
    const existing = listMonthlyAiAggregates().filter((row) => row.month !== month);
    replaceMonthlyAiAggregates([...existing, ...rows]);
  }

  return {
    ready: true,
    summary: summarizeMonthlyAiAggregates(month),
    rows:
      rows.length > 0
        ? rows
        : listMonthlyAiAggregates().filter((row) => row.month === month),
  };
}

export function schedulePersistMonthlyAiAggregate(input: {
  userId: string;
  month: string;
  model: string;
  feature: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): void {
  void persistMonthlyAiAggregateIncrement(input).catch(() => undefined);
}
