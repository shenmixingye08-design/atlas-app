export const REVENUE_EVENT_NAMES = [
  "content_created",
  "content_approved",
  "content_published",
  "link_clicked",
  "signup_completed",
  "first_job_completed",
  "first_automation_completed",
  "checkout_started",
  "subscription_started",
  "invoice_paid",
  "subscription_canceled",
  "refund_recorded",
] as const;

export type RevenueEventName = (typeof REVENUE_EVENT_NAMES)[number];

export const PUBLIC_GROWTH_EVENT_NAMES = ["link_clicked"] as const;
export type PublicGrowthEventName = (typeof PUBLIC_GROWTH_EVENT_NAMES)[number];

/** metadata に個人情報（メール・名前・住所）を入れない。 */
export type RevenueEventMetadata = Record<
  string,
  string | number | boolean | null
>;

export type RevenueAgentEvent = {
  eventId: string;
  eventName: RevenueEventName;
  occurredAt: string;
  anonymousVisitorId: string | null;
  userId: string | null;
  campaignId: string | null;
  contentId: string | null;
  source: string | null;
  medium: string | null;
  dedupeKey: string;
  metadata: RevenueEventMetadata;
};

export function isRevenueEventName(value: unknown): value is RevenueEventName {
  return (
    typeof value === "string" &&
    (REVENUE_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function isPublicGrowthEventName(
  value: unknown,
): value is PublicGrowthEventName {
  return value === "link_clicked";
}

export function clickDedupeKey(contentId: string, visitorId: string): string {
  return `click:${contentId}:${visitorId}`;
}

export function signupDedupeKey(userId: string): string {
  return `signup:${userId}`;
}

export function firstJobDedupeKey(userId: string): string {
  return `first_job:${userId}`;
}

export function firstAutomationDedupeKey(userId: string): string {
  return `first_automation:${userId}`;
}

export function checkoutStartedDedupeKey(userId: string, sessionId: string): string {
  return `checkout_started:${userId}:${sessionId}`;
}

export function subscriptionStartedDedupeKey(
  userId: string,
  subscriptionId: string,
): string {
  return `subscription_started:${userId}:${subscriptionId}`;
}

export function invoicePaidDedupeKey(stripeEventId: string): string {
  return `invoice_paid:${stripeEventId}`;
}

export function subscriptionCanceledDedupeKey(
  userId: string,
  subscriptionId: string,
): string {
  return `subscription_canceled:${userId}:${subscriptionId}`;
}

export function refundDedupeKey(stripeEventId: string): string {
  return `refund:${stripeEventId}`;
}

export function contentLifecycleDedupeKey(
  eventName: RevenueEventName,
  contentId: string,
): string {
  return `${eventName}:${contentId}`;
}
