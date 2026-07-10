/** User-facing notification categories. */
export type NotificationType =
  | "completed"
  | "awaiting_review"
  | "recommendation"
  | "error"
  | "billing"
  | "integration"
  | "automation";

export type NotificationAudience = "user" | "owner";

export type NotificationChannel = "in_app" | "email" | "line" | "slack" | "push";

export type NotificationRecord = {
  notificationId: string;
  userId: string | null;
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  message: string;
  relatedTaskId: string | null;
  relatedService: string | null;
  isRead: boolean;
  createdAt: string;
  actionUrl: string | null;
};

export type NotificationPreferences = {
  channels: {
    inApp: boolean;
    email: boolean;
    line: boolean;
    slack: boolean;
    push: boolean;
  };
  allEnabled: boolean;
  completedEnabled: boolean;
  awaitingReviewEnabled: boolean;
  errorEnabled: boolean;
  recommendationEnabled: boolean;
  billingEnabled: boolean;
  integrationEnabled: boolean;
  automationEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: {
    inApp: true,
    email: false,
    line: false,
    slack: false,
    push: false,
  },
  allEnabled: true,
  completedEnabled: true,
  awaitingReviewEnabled: true,
  errorEnabled: true,
  recommendationEnabled: true,
  billingEnabled: true,
  integrationEnabled: true,
  automationEnabled: true,
};

export type CreateNotificationInput = {
  audience: NotificationAudience;
  userId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  relatedTaskId?: string | null;
  relatedService?: string | null;
  actionUrl?: string | null;
};
