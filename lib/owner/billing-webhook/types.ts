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
  /** Null when logs are empty or not authoritative. */
  successRatePercent: number | null;
  /** Null when this process cannot confirm failures (do not show 0). */
  failureCount: number | null;
  totalCount: number;
  lastSyncedAt: string | null;
  recentWebhooks: readonly StripeWebhookLogEntry[];
  generatedAt: string;
  availability: "ok" | "empty" | "unavailable";
  statusMessage: string | null;
  authoritative: boolean;
};
