import "server-only";

import type { NotificationPreferences } from "@/lib/notifications/types";
import {
  listStoredPersonalMemories,
  readPersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { resolvePersonalMemories } from "@/lib/personal-memory/resolve";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import {
  assertMemoryLoadedForAi,
  loadMemory,
} from "@/lib/memory-apply/pipeline";

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
 * Sync overlay for createNotification.
 * Still records shared PersonalizationContext memory ids (all active) so
 * notification is not a silo — prefs overlay uses notification_preferences scope.
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

  const memories = listStoredPersonalMemories(input.userId);
  const sharedIds = memories
    .filter((m) => m.status === "active")
    .map((m) => m.id);

  const result = resolvePersonalMemories({
    userId: input.userId,
    settings,
    memories,
    allowedScopes: ["notification_preferences"],
    capabilities: ["notify"],
  });

  const preferences =
    result.used.length > 0
      ? overlayPreferences(input.base, result.used)
      : input.base;

  // Share proof: channel participates in the same Memory id set as other surfaces.
  const memoryIdsUsed = sharedIds.length > 0 ? sharedIds : result.used.map((u) => u.memoryId);
  const applied = memoryIdsUsed.length > 0;
  recordMemoryApplyEvent({
    userId: input.userId,
    channel: "notification",
    memoryMode: applied ? "on" : "off",
    applied,
    memoryIdsUsed,
    scopesUsed: applied
      ? [
          "notification_preferences",
          ...new Set(memories.filter((m) => m.status === "active").map((m) => m.scope)),
        ]
      : [],
    success: true,
  });
  return { preferences, memoryIdsUsed, applied };
}

/**
 * Canonical path: loadMemory → PersonalizationContext → notification overlay.
 */
export async function resolveNotificationPreferencesWithMemory(input: {
  userId: string;
  base: NotificationPreferences;
}): Promise<{
  preferences: NotificationPreferences;
  memoryIdsUsed: string[];
  applied: boolean;
}> {
  const applied = await loadMemory({
    userId: input.userId,
    channel: "notification",
    baseline: "notification preferences",
    capabilities: ["notify"],
  });
  assertMemoryLoadedForAi(applied.context);

  const notifyRows = applied.provider.personalValues.filter(
    (row) => row.scope === "notification_preferences",
  );
  const preferences =
    notifyRows.length > 0
      ? overlayPreferences(
          input.base,
          notifyRows.map((row) => ({ value: row.value })),
        )
      : input.base;

  return {
    preferences,
    memoryIdsUsed: applied.context.memoryIdsUsed,
    applied: applied.context.memoryIdsUsed.length > 0,
  };
}
