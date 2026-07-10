import type { StripeWebhookEventType } from "@/lib/billing/stripe/config";

export type StripeWebhookLogStatus = "success" | "failure" | "skipped";

export type StripeWebhookLogEntry = {
  id: string;
  stripeEventId: string;
  eventType: StripeWebhookEventType | string;
  status: StripeWebhookLogStatus;
  userId: string | null;
  planId: string | null;
  message: string;
  processedAt: string;
};

export type StripeWebhookMonitoringSnapshot = {
  latestWebhook: StripeWebhookLogEntry | null;
  successRatePercent: number;
  failureCount: number;
  totalCount: number;
  lastSyncedAt: string | null;
  recentWebhooks: readonly StripeWebhookLogEntry[];
  generatedAt: string;
};
