import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { StripeWebhookLogEntry, StripeWebhookLogStatus } from "./types";

export const WEBHOOK_TELEMETRY_TABLE = "atlas_stripe_webhook_telemetry";

type UntypedFrom = {
  insert: (row: Record<string, unknown>) => {
    select: (cols: string) => Promise<{
      data: unknown[] | null;
      error: { message?: string; code?: string } | null;
    }>;
  };
  select: (cols: string) => {
    order: (
      col: string,
      opts: { ascending: boolean },
    ) => {
      limit: (n: number) => Promise<{
        data: unknown[] | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

function asTable(client: object): UntypedFrom {
  return (client as { from: (table: string) => UntypedFrom }).from(
    WEBHOOK_TELEMETRY_TABLE,
  );
}

function rowToEntry(raw: Record<string, unknown>): StripeWebhookLogEntry {
  return {
    id: `swl_${String(raw.stripe_event_id ?? "")}`,
    stripeEventId: String(raw.stripe_event_id ?? ""),
    eventType: String(raw.event_type ?? ""),
    status: (raw.status as StripeWebhookLogStatus) ?? "failure",
    userId: typeof raw.user_id === "string" ? raw.user_id : null,
    planId: typeof raw.plan_id === "string" ? raw.plan_id : null,
    message:
      typeof raw.failure_reason === "string" && raw.failure_reason
        ? raw.failure_reason
        : typeof raw.message === "string"
          ? raw.message
          : "",
    processedAt: String(raw.processed_at ?? new Date().toISOString()),
    diagnosticId: typeof raw.diagnostic_id === "string" ? raw.diagnostic_id : null,
    failureCode: typeof raw.failure_code === "string" ? raw.failure_code : null,
  };
}

export async function insertWebhookTelemetryIfNew(
  entry: StripeWebhookLogEntry,
): Promise<"inserted" | "duplicate" | "failed"> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return "failed";

  const { data, error } = await asTable(client)
    .insert({
      stripe_event_id: entry.stripeEventId,
      event_type: entry.eventType,
      status: entry.status,
      processed_at: entry.processedAt,
      diagnostic_id: entry.diagnosticId ?? null,
      plan_id: entry.planId,
      user_id: entry.userId,
      failure_code: entry.failureCode ?? null,
      failure_reason: entry.message || null,
    })
    .select("stripe_event_id");

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message ?? "")) {
      return "duplicate";
    }
    return "failed";
  }
  if (Array.isArray(data) && data.length === 0) {
    return "duplicate";
  }
  return "inserted";
}

export async function loadWebhookTelemetryFromDurable(limit = 300): Promise<{
  ready: boolean;
  entries: StripeWebhookLogEntry[];
}> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return { ready: false, entries: [] };

  const { data, error } = await asTable(client)
    .select(
      "stripe_event_id, event_type, status, processed_at, diagnostic_id, plan_id, user_id, failure_code, failure_reason",
    )
    .order("processed_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    return { ready: false, entries: [] };
  }

  return {
    ready: true,
    entries: data.map((row) => rowToEntry(row as Record<string, unknown>)),
  };
}
