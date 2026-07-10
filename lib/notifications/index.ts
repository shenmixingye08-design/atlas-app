export type {
  NotificationType,
  NotificationAudience,
  NotificationChannel,
  NotificationRecord,
  NotificationPreferences,
  CreateNotificationInput,
} from "./types";

export { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";

export {
  createNotification,
  listUserNotifications,
  listOwnerNotifications,
  countUnreadUserNotifications,
  markNotificationRead,
  markAllUserNotificationsRead,
  removeUserNotification,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  resetUserNotificationPreferences,
} from "./service";

export { resetNotificationStore } from "./store";
