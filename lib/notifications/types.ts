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

/** LINE Messaging API event categories (ON/OFF per event). */
export type LineNotifyEvent =
  | "work_completed"
  | "mail_received"
  | "document_ready"
  | "automation_completed"
  | "confirmation_request"
  | "error"
  | "todays_schedule"
  | "morning_briefing";

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
  lineEvent?: LineNotifyEvent | null;
};

export type NotificationPreferences = {
  channels: {
    inApp: boolean;
    email: boolean;
    line: boolean;
    slack: boolean;
    push: boolean;
  };
  lineEvents: Record<LineNotifyEvent, boolean>;
  allEnabled: boolean;
  completedEnabled: boolean;
  awaitingReviewEnabled: boolean;
  errorEnabled: boolean;
  recommendationEnabled: boolean;
  billingEnabled: boolean;
  integrationEnabled: boolean;
  automationEnabled: boolean;
};

export const DEFAULT_LINE_EVENTS: Record<LineNotifyEvent, boolean> = {
  work_completed: true,
  mail_received: true,
  document_ready: true,
  automation_completed: true,
  confirmation_request: true,
  error: true,
  todays_schedule: true,
  morning_briefing: true,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: {
    inApp: true,
    email: false,
    line: false,
    slack: false,
    push: false,
  },
  lineEvents: { ...DEFAULT_LINE_EVENTS },
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
  lineEvent?: LineNotifyEvent | null;
};
