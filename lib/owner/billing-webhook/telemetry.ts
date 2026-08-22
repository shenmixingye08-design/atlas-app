import "server-only";

import { randomUUID } from "crypto";

import type { StripeWebhookEventType } from "@/lib/billing/stripe/config";

import {
  insertWebhookTelemetryIfNew,
  loadWebhookTelemetryFromDurable,
} from "./durable";
import {
  listStripeWebhookLogs,
  replaceStripeWebhookLogs,
  upsertStripeWebhookLog,
} from "./store";
import type {
  StripeWebhookLogEntry,
  StripeWebhookLogStatus,
  StripeWebhookMonitoringSnapshot,
} from "./types";

let durableHydrated = false;
let durableReady = false;

export function recordStripeWebhookLog(input: {
  stripeEventId: string;
  eventType: StripeWebhookEventType | string;
  status: StripeWebhookLogStatus;
  userId?: string | null;
  planId?: string | null;
  message: string;
  diagnosticId?: string | null;
  failureCode?: string | null;
}): StripeWebhookLogEntry {
  const entry: StripeWebhookLogEntry = {
    id: `swl_${randomUUID()}`,
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    status: input.status,
    userId: input.userId ?? null,
    planId: input.planId ?? null,
    message: input.message,
    processedAt: new Date().toISOString(),
    diagnosticId: input.diagnosticId ?? null,
    failureCode: input.failureCode ?? null,
  };

  const { entry: stored, inserted } = upsertStripeWebhookLog(entry);
  if (inserted) {
    void insertWebhookTelemetryIfNew(stored).catch(() => undefined);
  }
  return stored;
}

export async function ensureWebhookTelemetryHydrated(): Promise<boolean> {
  if (durableHydrated) return durableReady;
  durableHydrated = true;
  const loaded = await loadWebhookTelemetryFromDurable();
  durableReady = loaded.ready;
  if (loaded.ready) {
    replaceStripeWebhookLogs(loaded.entries);
  }
  return durableReady;
}

export function resetWebhookTelemetryHydrateForTests(): void {
  durableHydrated = false;
  durableReady = false;
}

export function buildStripeWebhookMonitoringSnapshot(
  now: Date = new Date(),
  options?: { durableReady?: boolean },
): StripeWebhookMonitoringSnapshot {
  const logs = listStripeWebhookLogs();
  const successCount = logs.filter((log) => log.status === "success").length;
  const failureCount = logs.filter((log) => log.status === "failure").length;
  const totalCount = logs.length;
  const latestWebhook = logs[0] ?? null;
  const lastSyncedAt =
    logs.find((log) => log.status === "success")?.processedAt ?? null;
  const ready = options?.durableReady ?? durableReady;

  if (!ready && totalCount === 0) {
    return {
      latestWebhook: null,
      successRatePercent: null,
      failureCount: null,
      successCount: null,
      totalCount: 0,
      lastSyncedAt: null,
      recentWebhooks: [],
      generatedAt: now.toISOString(),
      availability: "unavailable",
      statusMessage:
        "Webhook監視を確認できません。これは監視ログであり、正式な決済状態は Stripe Dashboard が正です。",
      authoritative: false,
      durable: false,
      lastKnownAt: null,
    };
  }

  if (totalCount === 0) {
    return {
      latestWebhook: null,
      successRatePercent: null,
      failureCount: null,
      successCount: null,
      totalCount: 0,
      lastSyncedAt: null,
      recentWebhooks: [],
      generatedAt: now.toISOString(),
      availability: "empty",
      statusMessage:
        "Webhook監視にイベントはありません。これは監視ログであり、正式な決済状態は Stripe Dashboard が正です。",
      authoritative: false,
      durable: ready,
      lastKnownAt: null,
    };
  }

  return {
    latestWebhook,
    successRatePercent: Math.round((successCount / totalCount) * 100),
    failureCount,
    successCount,
    totalCount,
    lastSyncedAt,
    recentWebhooks: logs.slice(0, 20),
    generatedAt: now.toISOString(),
    availability: "ok",
    statusMessage:
      "Webhook監視（永続ログ）。正式な決済状態・entitlement の正は Stripe / 既存 Billing Audit 契約です。",
    authoritative: false,
    durable: ready,
    lastKnownAt: lastSyncedAt,
  };
}

export type { StripeWebhookMonitoringSnapshot } from "./types";
