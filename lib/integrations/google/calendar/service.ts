import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getGoogleAccountAccessToken } from "@/lib/integrations/google/token-manager";

import { buildCalendarAutomationTriggers } from "./automation-plan";
import { fetchGoogleCalendarEvents } from "./api-client";
import { isCalendarRangeId, resolveCalendarRangeWindow } from "./ranges";
import type {
  CalendarEventsResult,
  CalendarEventsSnapshot,
  CalendarRangeId,
} from "./types";

export async function getGoogleCalendarEventsForUser(input: {
  userId: string;
  range: CalendarRangeId;
  context: FeatureAccessContext;
  now?: Date;
}): Promise<CalendarEventsResult> {
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
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

  const window = resolveCalendarRangeWindow(input.range, input.now);
  const events = await fetchGoogleCalendarEvents({
    accessToken,
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
