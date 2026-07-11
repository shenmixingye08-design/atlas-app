import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getGoogleAccountAccessToken } from "@/lib/integrations/google/token-manager";
import { notifyCalendarReminder } from "@/lib/notifications/emitters";
import { runWithAiBillingUsage } from "@/lib/billing/usage/request-context";

import {
  organizeCalendarEventsWithAi,
  proposeMeetingCandidatesWithAi,
} from "./ai-assistant";
import {
  computeFreeSlots,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
  fetchGoogleCalendarFreeBusy,
  updateGoogleCalendarEvent,
} from "./api-client";
import { buildCalendarAutomationTriggers } from "./automation-plan";
import { isCalendarRangeId, resolveCalendarRangeWindow } from "./ranges";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventsResult,
  CalendarEventsSnapshot,
  CalendarFetchStatus,
  CalendarFreeSlot,
  CalendarMeetingCandidate,
  CalendarOrganizeInsight,
  CalendarRangeId,
} from "./types";

type GateFailure = {
  status: Exclude<CalendarFetchStatus, "ready">;
  message: string;
};

async function requireCalendarAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<{ accessToken: string } | GateFailure> {
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
  }

  const { getBillingFeatureDenial } = await import("@/lib/billing/access");
  const denial = await getBillingFeatureDenial(
    input.userId,
    "google_integration",
  );
  if (denial) {
    return { status: "plan_required", message: denial.reason };
  }

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status !== "connected") {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  const accessToken = await getGoogleAccountAccessToken(input.userId);
  if (!accessToken) {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  return { accessToken };
}

function isGateFailure(
  value: { accessToken: string } | GateFailure,
): value is GateFailure {
  return "status" in value;
}

export async function getGoogleCalendarEventsForUser(input: {
  userId: string;
  range: CalendarRangeId;
  context: FeatureAccessContext;
  now?: Date;
}): Promise<CalendarEventsResult> {
  const access = await requireCalendarAccess(input);
  if (isGateFailure(access)) return access;

  const window = resolveCalendarRangeWindow(input.range, input.now);
  const events = await fetchGoogleCalendarEvents({
    accessToken: access.accessToken,
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  });

  const snapshot: CalendarEventsSnapshot = {
    range: input.range,
    rangeLabel: window.label,
    events,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };

  const automationTriggers =
    input.range === "today"
      ? buildCalendarAutomationTriggers(events, { now: input.now })
      : [];

  return {
    status: "ready",
    snapshot,
    automationTriggers,
  };
}

export function parseCalendarRangeParam(
  value: string | null,
): CalendarRangeId | null {
  if (!value || !isCalendarRangeId(value)) return null;
  return value;
}

export async function createCalendarEventForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  event: CalendarEventInput;
}): Promise<{ status: "ready"; event: CalendarEvent } | GateFailure> {
  const access = await requireCalendarAccess(input);
  if (isGateFailure(access)) return access;

  const event = await createGoogleCalendarEvent({
    accessToken: access.accessToken,
    event: input.event,
  });

  if (
    typeof input.event.remindMinutesBefore === "number" &&
    input.event.remindMinutesBefore >= 0
  ) {
    notifyCalendarReminder(
      input.userId,
      `「${event.title}」の予定を登録しました（${input.event.remindMinutesBefore}分前に通知）`,
    );
  }

  return { status: "ready", event };
}

export async function updateCalendarEventForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  eventId: string;
  event: CalendarEventInput;
}): Promise<
  | { status: "ready"; event: CalendarEvent }
  | GateFailure
> {
  const access = await requireCalendarAccess(input);
  if (isGateFailure(access)) return access;

  const event = await updateGoogleCalendarEvent({
    accessToken: access.accessToken,
    eventId: input.eventId,
    event: input.event,
  });

  return { status: "ready", event };
}

export async function deleteCalendarEventForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  eventId: string;
}): Promise<{ status: "ready" } | GateFailure> {
  const access = await requireCalendarAccess(input);
  if (isGateFailure(access)) return access;

  await deleteGoogleCalendarEvent({
    accessToken: access.accessToken,
    eventId: input.eventId,
  });

  return { status: "ready" };
}

export async function findFreeSlotsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  range: CalendarRangeId;
  slotMinutes?: number;
  now?: Date;
}): Promise<
  | { status: "ready"; slots: CalendarFreeSlot[]; rangeLabel: string }
  | GateFailure
> {
  const access = await requireCalendarAccess(input);
  if (isGateFailure(access)) return access;

  const window = resolveCalendarRangeWindow(input.range, input.now);
  const busy = await fetchGoogleCalendarFreeBusy({
    accessToken: access.accessToken,
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  });

  const slots = computeFreeSlots({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
    busy,
    slotMinutes: input.slotMinutes ?? 30,
  });

  return { status: "ready", slots, rangeLabel: window.label };
}

export async function organizeCalendarForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  range: CalendarRangeId;
  now?: Date;
}): Promise<
  | {
      status: "ready";
      insight: CalendarOrganizeInsight;
      events: readonly CalendarEvent[];
    }
  | GateFailure
> {
  const listed = await getGoogleCalendarEventsForUser(input);
  if (listed.status !== "ready") return listed;

  const insight = await runWithAiBillingUsage(
    {
      userId: input.userId,
      api: "google_calendar",
      feature: "google_integration",
    },
    () => organizeCalendarEventsWithAi(listed.snapshot.events),
  );
  return {
    status: "ready",
    insight,
    events: listed.snapshot.events,
  };
}

export async function proposeMeetingsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  range: CalendarRangeId;
  durationMinutes?: number;
  purpose?: string;
  now?: Date;
}): Promise<
  | {
      status: "ready";
      candidates: CalendarMeetingCandidate[];
      freeSlots: CalendarFreeSlot[];
    }
  | GateFailure
> {
  const durationMinutes = input.durationMinutes ?? 30;
  const free = await findFreeSlotsForUser({
    userId: input.userId,
    context: input.context,
    range: input.range,
    slotMinutes: durationMinutes,
    now: input.now,
  });
  if (free.status !== "ready") return free;

  const candidates = await runWithAiBillingUsage(
    {
      userId: input.userId,
      api: "google_calendar",
      feature: "google_integration",
    },
    () =>
      proposeMeetingCandidatesWithAi({
        freeSlots: free.slots,
        durationMinutes,
        purpose: input.purpose,
      }),
  );

  return {
    status: "ready",
    candidates,
    freeSlots: free.slots,
  };
}
