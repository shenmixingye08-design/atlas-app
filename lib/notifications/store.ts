import type { NotificationPreferences, NotificationRecord } from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";

type NotificationBucket = NotificationRecord[];
type PreferencesMap = Map<string, NotificationPreferences>;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __atlasNotificationStore?: NotificationBucket;
    __atlasNotificationPreferences?: PreferencesMap;
  };
}

function getBucket(): NotificationBucket {
  const scope = getGlobalScope();
  if (!scope.__atlasNotificationStore) {
    scope.__atlasNotificationStore = [];
  }
  return scope.__atlasNotificationStore;
}

function getPreferencesMap(): PreferencesMap {
  const scope = getGlobalScope();
  if (!scope.__atlasNotificationPreferences) {
    scope.__atlasNotificationPreferences = new Map();
  }
  return scope.__atlasNotificationPreferences;
}

const MAX_NOTIFICATIONS = 500;

export function appendNotification(record: NotificationRecord): NotificationRecord {
  getBucket().unshift(record);
  if (getBucket().length > MAX_NOTIFICATIONS) {
    getBucket().length = MAX_NOTIFICATIONS;
  }
  return record;
}

export function listStoredNotifications(filter?: {
  audience?: NotificationRecord["audience"];
  userId?: string;
}): NotificationRecord[] {
  return getBucket().filter((record) => {
    if (filter?.audience && record.audience !== filter.audience) return false;
    if (filter?.userId && record.userId !== filter.userId) return false;
    return true;
  });
}

export function findNotification(notificationId: string): NotificationRecord | null {
  return getBucket().find((r) => r.notificationId === notificationId) ?? null;
}

export function updateNotification(
  notificationId: string,
  patch: Partial<Pick<NotificationRecord, "isRead">>,
): NotificationRecord | null {
  const record = findNotification(notificationId);
  if (!record) return null;
  Object.assign(record, patch);
  return record;
}

export function deleteNotification(notificationId: string): boolean {
  const bucket = getBucket();
  const index = bucket.findIndex((r) => r.notificationId === notificationId);
  if (index === -1) return false;
  bucket.splice(index, 1);
  return true;
}

export function getStoredPreferences(userId: string): NotificationPreferences {
  const prefs = getPreferencesMap().get(userId);
  return prefs ? { ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefs } : DEFAULT_NOTIFICATION_PREFERENCES;
}

export function saveStoredPreferences(
  userId: string,
  prefs: NotificationPreferences,
): NotificationPreferences {
  getPreferencesMap().set(userId, prefs);
  return prefs;
}

export function resetNotificationStore(): void {
  getBucket().length = 0;
  getPreferencesMap().clear();
}
