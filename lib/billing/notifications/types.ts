export type BillingNotificationAudience = "user" | "owner";

export type BillingNotificationKind =
  | "payment_failed"
  | "payment_succeeded"
  | "plan_changed"
  | "plan_downgraded"
  | "payment_grace_scheduled";

export type BillingNotificationRecord = {
  id: string;
  audience: BillingNotificationAudience;
  userId: string | null;
  kind: BillingNotificationKind;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};
