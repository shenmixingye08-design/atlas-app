import type { PlanDefinition } from "./plans/types";
import type { UserSubscriptionView } from "./subscriptions/types";
import type { StripeEnvPresence } from "./stripe/config";
import type { UsageAwarenessView } from "./usage-awareness/types";
import type { UsageLimitSummary } from "./usage/types";
import type { BillingNotificationRecord } from "./notifications/types";

/** Public billing summary returned by /api/billing/summary. */
export type UserBillingSummary = {
  subscription: UserSubscriptionView;
  usage: UsageLimitSummary;
  usageAwareness: UsageAwarenessView;
  plan: PlanDefinition;
  stripeLiveMode: boolean;
  /** Temporary safe diagnostics — never includes the secret itself. */
  secretConfigured: boolean;
  secretLength: number;
  secretPrefixValid: boolean;
  billingPortalAvailable: boolean;
  automationsSuspended: boolean;
  notifications: readonly BillingNotificationRecord[];
  stripeConfig: {
    secretKey: StripeEnvPresence;
    publishableKey: StripeEnvPresence;
    webhookSecret: StripeEnvPresence;
    prices: {
      light: StripeEnvPresence;
      standard: StripeEnvPresence;
      premium: StripeEnvPresence;
    };
    checkoutReady: {
      light: boolean;
      standard: boolean;
      premium: boolean;
    };
  };
};

export type { OwnerBillingMetrics, OwnerPlanBreakdown } from "./analytics/types";
