import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import {
  classifyNotificationPersistError,
  logAutomationNotificationPersistence,
} from "./persist-log";

import type {
  NotificationPreferences,
  NotificationRecord,
} from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";
// NotificationPreferences used by applyLoadedPreferences
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
      void persistNotificationsNow(userId).catch((error) => {
        logAutomationNotificationPersistence({
          success: false,
          durationMs: 0,
          persistenceTarget: "atlas_user_state",
          userId,
          errorCode: classifyNotificationPersistError(error),
          stage: "schedule_persist_blob",
        });
      });
    }, 50),
  );
}

/**
 * Awaitable durable write. Serverless instances can freeze the moment a route
 * returns its Response, so fire-and-forget persistence may never reach Supabase.
 */
export class NotificationPersistenceFailedError extends Error {
  readonly code = "notification_blob_persist_failed";

  constructor(message: string) {
    super(message);
    this.name = "NotificationPersistenceFailedError";
  }
}

export async function persistNotificationsNow(userId: string): Promise<void> {
  const pending = pendingTimers.get(userId);
  if (pending) {
    clearTimeout(pending);
    pendingTimers.delete(userId);
  }
  const result = await persistDurableDomain(
    userId,
    NOTIFICATIONS_DOMAIN_KEY,
    snapshotNotifications(userId),
    {
      compact: compactNotifications,
      forceSupabase: true,
    },
  );
  if (result === "skipped") {
    throw new NotificationPersistenceFailedError(
      "[notifications] atlasNotifications blob persist skipped — Supabase is required",
    );
  }
}

function applyLoadedPreferences(
  userId: string,
  preferences: NotificationPreferences,
): void {
  saveStoredPreferences(userId, {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...preferences,
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...preferences.channels,
    },
    lineEvents: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.lineEvents,
      ...preferences.lineEvents,
    },
    push: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.push,
      ...preferences.push,
      events: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.push.events,
        ...preferences.push?.events,
      },
      severities: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.push.severities,
        ...preferences.push?.severities,
      },
      quietHoursStart:
        preferences.push?.quietHoursStart ??
        DEFAULT_NOTIFICATION_PREFERENCES.push.quietHoursStart,
      quietHoursEnd:
        preferences.push?.quietHoursEnd ??
        DEFAULT_NOTIFICATION_PREFERENCES.push.quietHoursEnd,
    },
  });
}

export async function ensureNotificationsHydrated(
  userId: string,
): Promise<void> {
  if (isUserHydrated(userId)) return;
  markUserHydrated(userId);

  let hydratedFromRows = false;
  try {
    const { isNotificationDurableRequired } = await import(
      "./notification-backend"
    );
    if (isNotificationDurableRequired()) {
      const { listDurableNotifications } = await import("./durable-inbox");
      const rows = await listDurableNotifications({ ownerId: userId });
      replaceUserNotifications(userId, rows);
      hydratedFromRows = true;
    }
  } catch {
    /* fall through to blob hydrate */
  }

  const loaded = await loadDurableDomain<DurableNotificationsState>(
    userId,
    NOTIFICATIONS_DOMAIN_KEY,
  );

  if (
    !hydratedFromRows &&
    loaded &&
    Array.isArray(loaded.notifications) &&
    listStoredNotifications({ audience: "user", userId }).length === 0
  ) {
    replaceUserNotifications(userId, loaded.notifications);
  }

  if (loaded?.preferences) {
    applyLoadedPreferences(userId, loaded.preferences);
  }
}
