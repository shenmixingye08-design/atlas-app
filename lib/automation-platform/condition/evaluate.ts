/**
 * Evaluate condition triggers against real provider sources (poll).
 */

import "server-only";

import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import type { CalendarEvent } from "@/lib/integrations/google/calendar/types";

import {
  isSupportedConditionExpression,
  parseCalendarTitleFilterFromTrigger,
  resolveConditionEventType,
  resolveConditionProvider,
} from "./parse-filter";
import type { ConditionEvalOutcome } from "./types";

export type CalendarEventsFetcher = (input: {
  userId: string;
  context: FeatureAccessContext;
  timeMin: string;
  timeMax: string;
  calendarId: string;
}) => Promise<
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; errorCode: string; errorMessage: string; retryable: boolean }
>;

function titlesMatch(
  eventTitle: string,
  expected: string,
  mode: "equals" | "contains",
): boolean {
  const left = eventTitle.trim();
  const right = expected.trim();
  if (!left || !right) return false;
  if (mode === "contains") {
    return left.includes(right);
  }
  return left === right;
}

export async function defaultGoogleCalendarEventsFetcher(input: {
  userId: string;
  context: FeatureAccessContext;
  timeMin: string;
  timeMax: string;
  calendarId: string;
}): Promise<
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; errorCode: string; errorMessage: string; retryable: boolean }
> {
  try {
    const {
      isGoogleAccessGateFailure,
      requireGoogleIntegrationAccess,
    } = await import("@/lib/integrations/google/require-access");
    const access = await requireGoogleIntegrationAccess({
      userId: input.userId,
      context: input.context,
      capability: "calendar",
    });
    if (isGoogleAccessGateFailure(access)) {
      return {
        ok: false,
        errorCode: access.status,
        errorMessage: access.message ?? "google_calendar_unavailable",
        retryable: access.status === "needs_reconnect",
      };
    }
    const { fetchGoogleCalendarEvents } = await import(
      "@/lib/integrations/google/calendar/api-client"
    );
    const events = await fetchGoogleCalendarEvents({
      accessToken: access.accessToken,
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      calendarId: input.calendarId,
    });
    return { ok: true, events };
  } catch (error) {
    return {
      ok: false,
      errorCode: "google_calendar_list_failed",
      errorMessage:
        error instanceof Error ? error.message.slice(0, 200) : "list_failed",
      retryable: true,
    };
  }
}

/**
 * Evaluate one condition automation. Fail-closed when unevaluable.
 */
export async function evaluateConditionAutomation(input: {
  automation: AutomationV2;
  context: FeatureAccessContext;
  nowMs?: number;
  calendarEventsFetcher?: CalendarEventsFetcher;
}): Promise<ConditionEvalOutcome> {
  const trigger = input.automation.trigger;
  if (trigger.type !== "condition" && trigger.type !== "event") {
    return {
      evaluated: false,
      errorCode: "not_condition_trigger",
      errorMessage: "trigger_type_not_condition",
      retryable: false,
    };
  }

  const expression = trigger.condition?.expression ?? "";
  if (trigger.type === "condition" && !isSupportedConditionExpression(expression)) {
    return {
      evaluated: false,
      errorCode: "condition_expression_unsupported",
      errorMessage: expression || "missing_expression",
      retryable: false,
    };
  }

  const provider = resolveConditionProvider(trigger);
  const eventType = resolveConditionEventType(trigger);
  if (!provider) {
    return {
      evaluated: false,
      errorCode: "provider_unknown",
      errorMessage: "condition_provider_missing",
      retryable: false,
    };
  }

  if (provider !== "google_calendar") {
    return {
      evaluated: false,
      errorCode: "provider_unsupported",
      errorMessage: provider,
      retryable: false,
    };
  }

  const filter = parseCalendarTitleFilterFromTrigger(trigger);
  if (!filter?.title) {
    return {
      evaluated: false,
      errorCode: "condition_filter_incomplete",
      errorMessage: "title_filter_required",
      retryable: false,
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const lookbackMs = (filter.lookbackDays ?? 30) * 86_400_000;
  const lookaheadMs = (filter.lookaheadDays ?? 365) * 86_400_000;
  const timeMin = new Date(nowMs - lookbackMs).toISOString();
  const timeMax = new Date(nowMs + lookaheadMs).toISOString();
  const fetcher = input.calendarEventsFetcher ?? defaultGoogleCalendarEventsFetcher;

  const listed = await fetcher({
    userId: input.automation.userId,
    context: input.context,
    timeMin,
    timeMax,
    calendarId: filter.calendarId ?? "primary",
  });

  if (!listed.ok) {
    return {
      evaluated: false,
      errorCode: listed.errorCode,
      errorMessage: listed.errorMessage,
      retryable: listed.retryable,
    };
  }

  const matched = listed.events.filter((event) =>
    titlesMatch(event.title, filter.title, filter.matchMode),
  );

  // Fail-closed: matched events must carry provider event ids.
  const withIds = matched.filter((event) => Boolean(event.id?.trim()));
  if (matched.length > 0 && withIds.length === 0) {
    return {
      evaluated: false,
      errorCode: "required_event_id_missing",
      errorMessage: "matched_events_missing_id",
      retryable: false,
    };
  }

  const evaluatedAt = new Date(nowMs).toISOString();
  return {
    evaluated: true,
    conditionState: withIds.length > 0,
    provider,
    eventType,
    matchedResourceIds: withIds.map((event) => event.id),
    primaryResourceId: withIds[0]?.id ?? null,
    evidence: {
      eventIds: withIds.map((event) => event.id),
      titles: withIds.map((event) => event.title),
      evaluatedAt,
    },
  };
}
