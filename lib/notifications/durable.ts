import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { NotificationPreferences, NotificationRecord } from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";
import {
  listStoredNotifications,
  replaceUserNotifications,
  getStoredPreferences,
  saveStoredPreferences,
  markUserHydrated,
  isUserHydrated,
} from "./store";

export const NOTIFICATIONS_DOMAIN_KEY = "atlasNotifications";

export type DurableNotificationsState = {
  notifications: NotificationRecord[];
  preferences: NotificationPreferences;
};

const MAX_CLERK_NOTIFICATIONS = 40;

function compactNotifications(
  state: DurableNotificationsState,
): DurableNotificationsState {
  return {
    preferences: state.preferences,
    notifications: state.notifications.slice(0, MAX_CLERK_NOTIFICATIONS).map((n) => ({
      ...n,
      title: n.title.slice(0, 120),
      message: n.message.slice(0, 240),
    })),
  };
}

export function snapshotNotifications(
  userId: string,
): DurableNotificationsState {
  return {
    notifications: listStoredNotifications({ audience: "user", userId }),
    preferences: getStoredPreferences(userId),
  };
}

export function schedulePersistNotifications(userId: string): void {
  void persistDurableDomain(
    userId,
    NOTIFICATIONS_DOMAIN_KEY,
    snapshotNotifications(userId),
    { compact: compactNotifications },
  );
}

export async function ensureNotificationsHydrated(userId: string): Promise<void> {
  if (isUserHydrated(userId)) return;
  markUserHydrated(userId);

  const existing = listStoredNotifications({ audience: "user", userId });
  if (existing.length > 0) return;

  const loaded = await loadDurableDomain<DurableNotificationsState>(
    userId,
    NOTIFICATIONS_DOMAIN_KEY,
  );
  if (!loaded) return;

  if (Array.isArray(loaded.notifications)) {
    replaceUserNotifications(userId, loaded.notifications);
  }
  if (loaded.preferences) {
    saveStoredPreferences(userId, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...loaded.preferences,
      channels: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
        ...loaded.preferences.channels,
      },
      lineEvents: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.lineEvents,
        ...loaded.preferences.lineEvents,
      },
    });
  }
}
