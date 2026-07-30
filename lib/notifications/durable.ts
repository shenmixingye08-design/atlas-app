import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type {
  NotificationPreferences,
  NotificationRecord,
} from "./types";
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

function compactNotifications(
  state: DurableNotificationsState,
): DurableNotificationsState {
  return {
    preferences: state.preferences,
    notifications: [],
  };
}

export function snapshotNotifications(
  userId: string,
): DurableNotificationsState {
  return {
    notifications: listStoredNotifications({
      audience: "user",
      userId,
    }),
    preferences: getStoredPreferences(userId),
  };
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced durable write — coalesces bursts from createNotification + mark-read.
 * Serverless routes that must flush before response should call persistNotificationsNow.
 */
export function schedulePersistNotifications(userId: string): void {
  const existing = pendingTimers.get(userId);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    userId,
    setTimeout(() => {
      pendingTimers.delete(userId);
      void persistNotificationsNow(userId);
    }, 50),
  );
}

/**
 * Awaitable durable write. Serverless instances can freeze the moment a route
 * returns its Response, so fire-and-forget persistence may never reach Supabase.
 */
export async function persistNotificationsNow(userId: string): Promise<void> {
  const pending = pendingTimers.get(userId);
  if (pending) {
    clearTimeout(pending);
    pendingTimers.delete(userId);
  }
  await persistDurableDomain(
    userId,
    NOTIFICATIONS_DOMAIN_KEY,
    snapshotNotifications(userId),
    {
      compact: compactNotifications,
      forceSupabase: true,
    },
  );
}

export async function ensureNotificationsHydrated(
  userId: string,
): Promise<void> {
  if (isUserHydrated(userId)) return;
  markUserHydrated(userId);

  const existing = listStoredNotifications({
    audience: "user",
    userId,
  });

  if (existing.length > 0) return;

  const loaded =
    await loadDurableDomain<DurableNotificationsState>(
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
      push: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.push,
        ...loaded.preferences.push,
        events: {
          ...DEFAULT_NOTIFICATION_PREFERENCES.push.events,
          ...loaded.preferences.push?.events,
        },
        severities: {
          ...DEFAULT_NOTIFICATION_PREFERENCES.push.severities,
          ...loaded.preferences.push?.severities,
        },
        quietHoursStart:
          loaded.preferences.push?.quietHoursStart ??
          DEFAULT_NOTIFICATION_PREFERENCES.push.quietHoursStart,
        quietHoursEnd:
          loaded.preferences.push?.quietHoursEnd ??
          DEFAULT_NOTIFICATION_PREFERENCES.push.quietHoursEnd,
      },
    });
  }
}
