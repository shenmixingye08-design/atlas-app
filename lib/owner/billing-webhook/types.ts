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
  /** Null when no webhook logs exist (do not invent 100%). */
  successRatePercent: number | null;
  failureCount: number;
  totalCount: number;
  lastSyncedAt: string | null;
  recentWebhooks: readonly StripeWebhookLogEntry[];
  generatedAt: string;
};
