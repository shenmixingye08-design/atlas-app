import type { NotificationPreferences, NotificationRecord } from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";

type NotificationBucket = NotificationRecord[];
type PreferencesMap = Map<string, NotificationPreferences>;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __atlasNotificationStore?: NotificationBucket;
    __atlasNotificationPreferences?: PreferencesMap;
    __atlasNotificationHydratedUsers?: Set<string>;
  };
}

function getHydratedUsers(): Set<string> {
  const scope = getGlobalScope();
  if (!scope.__atlasNotificationHydratedUsers) {
    scope.__atlasNotificationHydratedUsers = new Set();
  }
  return scope.__atlasNotificationHydratedUsers;
}

export function isUserHydrated(userId: string): boolean {
  return getHydratedUsers().has(userId);
}

export function markUserHydrated(userId: string): void {
  getHydratedUsers().add(userId);
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
  patch: Partial<NotificationRecord>,
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
  if (!prefs) {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      lineEvents: { ...DEFAULT_NOTIFICATION_PREFERENCES.lineEvents },
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels },
      push: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.push,
        events: { ...DEFAULT_NOTIFICATION_PREFERENCES.push.events },
        severities: { ...DEFAULT_NOTIFICATION_PREFERENCES.push.severities },
      },
    };
  }
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...prefs,
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...prefs.channels,
    },
    lineEvents: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.lineEvents,
      ...prefs.lineEvents,
    },
    push: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.push,
      ...prefs.push,
      events: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.push.events,
        ...prefs.push?.events,
      },
      severities: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.push.severities,
        ...prefs.push?.severities,
      },
    },
  };
}

export function saveStoredPreferences(
  userId: string,
  prefs: NotificationPreferences,
): NotificationPreferences {
  getPreferencesMap().set(userId, prefs);
  return prefs;
}

/** Replace one user's in-app notifications (used when hydrating from durable store). */
export function replaceUserNotifications(
  userId: string,
  records: NotificationRecord[],
): void {
  const bucket = getBucket();
  const kept = bucket.filter(
    (record) => !(record.audience === "user" && record.userId === userId),
  );
  bucket.length = 0;
  bucket.push(
    ...records.filter((r) => r.userId === userId && r.audience === "user"),
    ...kept,
  );
  if (bucket.length > MAX_NOTIFICATIONS) {
    bucket.length = MAX_NOTIFICATIONS;
  }
}

export function resetNotificationStore(): void {
  getBucket().length = 0;
  getPreferencesMap().clear();
  getHydratedUsers().clear();
}
