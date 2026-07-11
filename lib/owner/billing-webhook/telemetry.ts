import "server-only";

import { randomUUID } from "crypto";

import type { StripeWebhookEventType } from "@/lib/billing/stripe/config";

import { appendStripeWebhookLog, listStripeWebhookLogs } from "./store";
import type {
  StripeWebhookLogEntry,
  StripeWebhookLogStatus,
  StripeWebhookMonitoringSnapshot,
} from "./types";

export function recordStripeWebhookLog(input: {
  stripeEventId: string;
  eventType: StripeWebhookEventType | string;
  status: StripeWebhookLogStatus;
  userId?: string | null;
  planId?: string | null;
  message: string;
}): StripeWebhookLogEntry {
  return appendStripeWebhookLog({
    id: `swl_${randomUUID()}`,
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    status: input.status,
    userId: input.userId ?? null,
    planId: input.planId ?? null,
    message: input.message,
    processedAt: new Date().toISOString(),
  });
}

export function buildStripeWebhookMonitoringSnapshot(
  now: Date = new Date(),
): StripeWebhookMonitoringSnapshot {
  const logs = listStripeWebhookLogs();
  const successCount = logs.filter((log) => log.status === "success").length;
  const failureCount = logs.filter((log) => log.status === "failure").length;
  const totalCount = logs.length;
  const latestWebhook = logs[0] ?? null;
  const lastSyncedAt =
    logs.find((log) => log.status === "success")?.processedAt ?? null;

  return {
    latestWebhook,
    successRatePercent:
      totalCount > 0 ? Math.round((successCount / totalCount) * 100) : null,
    failureCount,
    totalCount,
    lastSyncedAt,
    recentWebhooks: logs.slice(0, 20),
    generatedAt: now.toISOString(),
  };
}

export type { StripeWebhookMonitoringSnapshot } from "./types";
