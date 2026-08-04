export type NotificationChannel = "in_app" | "line" | "web_push" | "email";

export type AutomationNotificationPolicy = {
  beforeRun: boolean;
  onSuccess: boolean;
  onFailure: boolean;
  onNeedsInput: boolean;
  channels: NotificationChannel[];
};

export const DEFAULT_NOTIFICATION_POLICY: AutomationNotificationPolicy = {
  beforeRun: false,
  onSuccess: true,
  onFailure: true,
  onNeedsInput: true,
  channels: ["in_app"],
};
