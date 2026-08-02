import "server-only";

import type { NotificationPreferences } from "@/lib/notifications/types";
import {
  listStoredPersonalMemories,
  readPersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { resolvePersonalMemories } from "@/lib/personal-memory/resolve";
import { ensurePersonalMemoryHydrated } from "@/lib/personal-memory/durable";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function overlayPreferences(
  base: NotificationPreferences,
  values: Array<{ value: Record<string, unknown> }>,
): NotificationPreferences {
  const next: NotificationPreferences = {
    ...base,
    channels: { ...base.channels },
    lineEvents: { ...base.lineEvents },
    push: { ...base.push },
  };

  for (const row of values) {
    const v = row.value;
    const allEnabled = asBoolean(v.allEnabled);
    if (allEnabled != null) next.allEnabled = allEnabled;
    const completed = asBoolean(v.completedEnabled);
    if (completed != null) next.completedEnabled = completed;
    const awaiting = asBoolean(v.awaitingReviewEnabled);
    if (awaiting != null) next.awaitingReviewEnabled = awaiting;
    const errorEnabled = asBoolean(v.errorEnabled);
    if (errorEnabled != null) next.errorEnabled = errorEnabled;
    const automationEnabled = asBoolean(v.automationEnabled);
    if (automationEnabled != null) next.automationEnabled = automationEnabled;

    const channels = v.channels;
    if (channels && typeof channels === "object" && !Array.isArray(channels)) {
      const c = channels as Record<string, unknown>;
      const inApp = asBoolean(c.inApp);
      if (inApp != null) next.channels.inApp = inApp;
      const email = asBoolean(c.email);
      if (email != null) next.channels.email = email;
      const line = asBoolean(c.line);
      if (line != null) next.channels.line = line;
      const slack = asBoolean(c.slack);
      if (slack != null) next.channels.slack = slack;
      const push = asBoolean(c.push);
      if (push != null) next.channels.push = push;
    }
  }
  return next;
}

/**
 * Sync overlay using already-hydrated Personal Memory store.
 * Safe for createNotification (sync path).
 */
export function resolveNotificationPreferencesWithMemorySync(input: {
  userId: string;
  base: NotificationPreferences;
}): {
  preferences: NotificationPreferences;
  memoryIdsUsed: string[];
  applied: boolean;
} {
  const settings = readPersonalMemorySettings(input.userId);
  if (!settings.enabled) {
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "notification",
      memoryMode: "off",
      applied: false,
      success: true,
    });
    return { preferences: input.base, memoryIdsUsed: [], applied: false };
  }

  const result = resolvePersonalMemories({
    userId: input.userId,
    settings,
    memories: listStoredPersonalMemories(input.userId),
    allowedScopes: ["notification_preferences"],
    capabilities: ["notify"],
  });

  if (result.used.length === 0) {
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "notification",
      memoryMode: "off",
      applied: false,
      success: true,
    });
    return { preferences: input.base, memoryIdsUsed: [], applied: false };
  }

  const preferences = overlayPreferences(input.base, result.used);
  const memoryIdsUsed = result.used.map((u) => u.memoryId);
  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "notification",
    memoryMode: "on",
    applied: true,
    memoryIdsUsed,
    scopesUsed: ["notification_preferences"],
    success: true,
  });
  return { preferences, memoryIdsUsed, applied: true };
}

/** Async variant — hydrates durable Personal Memory first. */
export async function resolveNotificationPreferencesWithMemory(input: {
  userId: string;
  base: NotificationPreferences;
}): Promise<{
  preferences: NotificationPreferences;
  memoryIdsUsed: string[];
  applied: boolean;
}> {
  try {
    await ensurePersonalMemoryHydrated(input.userId);
    return resolveNotificationPreferencesWithMemorySync(input);
  } catch {
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "notification",
      memoryMode: "off",
      applied: false,
      success: false,
      failureReason: "resolve_failed",
    });
    return {
      preferences: input.base,
      memoryIdsUsed: [],
      applied: false,
    };
  }
}
