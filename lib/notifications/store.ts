import type { NotificationPreferences, NotificationRecord } from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";

/** Per-user inbox cap (P0-4). Never a shared global buffer across users. */
export const MAX_NOTIFICATIONS_PER_USER = 500;

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

/** @deprecated Use MAX_NOTIFICATIONS_PER_USER — global buffer removed (P0-4). */
export const MAX_NOTIFICATIONS = MAX_NOTIFICATIONS_PER_USER;

function trimUserNotifications(userId: string): void {
  const bucket = getBucket();
  const userRows = bucket.filter(
    (r) => r.audience === "user" && r.userId === userId,
  );
  if (userRows.length <= MAX_NOTIFICATIONS_PER_USER) return;
  const dropIds = new Set(
    userRows
      .slice(MAX_NOTIFICATIONS_PER_USER)
      .map((r) => r.notificationId),
  );
  const next = bucket.filter((r) => !dropIds.has(r.notificationId));
  bucket.length = 0;
  bucket.push(...next);
}

export function appendNotification(record: NotificationRecord): NotificationRecord {
  getBucket().unshift(record);
  // P0-4: per-user retention only — never evict another user's rows.
  if (record.userId) {
    trimUserNotifications(record.userId);
  }
  return record;
}

export function listStoredNotifications(filter?: {
  audience?: NotificationRecord["audience"];
  userId?: string;
}): NotificationRecord[] {
  // P0-4: ownerId/userId required for user audience lists (no full dump filter).
  if (filter?.audience === "user" && !filter.userId?.trim()) {
    return [];
  }
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
  const userOnly = records
    .filter((r) => r.userId === userId && r.audience === "user")
    .slice(0, MAX_NOTIFICATIONS_PER_USER);
  bucket.length = 0;
  bucket.push(...userOnly, ...kept);
}

export function resetNotificationStore(): void {
  getBucket().length = 0;
  getPreferencesMap().clear();
  getHydratedUsers().clear();
}
