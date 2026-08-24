export const FIRST_REVENUE_EVENT_NAMES = [
  "offer_lp_viewed",
  "offer_cta_clicked",
  "signup_completed",
  "first_use_started",
  "first_use_succeeded",
  "first_use_failed",
  "upgrade_viewed",
  "checkout_started",
  "checkout_completed",
  "invoice_paid",
] as const;

export type FirstRevenueEventName = (typeof FIRST_REVENUE_EVENT_NAMES)[number];

export type FirstRevenueEvent = {
  eventId: string;
  eventName: FirstRevenueEventName;
  occurredAt: string;
  visitorId: string | null;
  userId: string | null;
  campaignId: string;
  contentId: string;
  livemode: boolean | null;
  amountYen: number | null;
  dedupeKey: string;
};

export type FirstRevenueSession = {
  visitorId: string | null;
  userId: string | null;
  campaignId: string;
  contentId: string;
  boundAt: string | null;
};

export type OfferLpStatus = "draft" | "approved";

export type SprintGoalState = "unmet" | "met";
