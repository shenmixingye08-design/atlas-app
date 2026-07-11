export type CalendarRangeId = "today" | "this_week" | "next_week";

export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  isAllDay: boolean;
  description: string | null;
  meetLink: string | null;
  htmlLink: string | null;
};

export type CalendarEventInput = {
  title: string;
  startAt: string;
  endAt: string;
  description?: string | null;
  location?: string | null;
  isAllDay?: boolean;
  createMeet?: boolean;
  /** Minutes before start for Google popup/email reminder. */
  remindMinutesBefore?: number | null;
};

export type CalendarRangeWindow = {
  range: CalendarRangeId;
  label: string;
  timeMin: string;
  timeMax: string;
};

export type CalendarEventsSnapshot = {
  range: CalendarRangeId;
  rangeLabel: string;
  events: readonly CalendarEvent[];
  generatedAt: string;
};

/** Automation hook design — notify before event, run work after event ends. */
export type CalendarAutomationTriggerKind =
  | "pre_event_notify"
  | "post_event_work";

export type CalendarAutomationTrigger = {
  eventId: string;
  title: string;
  kind: CalendarAutomationTriggerKind;
  scheduledAt: string;
  eventStartAt: string;
  eventEndAt: string;
};

export type CalendarFetchStatus =
  | "ready"
  | "google_not_connected"
  | "feature_disabled"
  | "plan_required"
  | "unauthorized";

export type CalendarEventsResult =
  | {
      status: "ready";
      snapshot: CalendarEventsSnapshot;
      automationTriggers: readonly CalendarAutomationTrigger[];
    }
  | {
      status: Exclude<CalendarFetchStatus, "ready">;
      message: string;
    };

export type CalendarFreeSlot = {
  startAt: string;
  endAt: string;
  durationMinutes: number;
};

export type CalendarMeetingCandidate = {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  reason: string;
  score: number;
};

export type CalendarOrganizeInsight = {
  summaryLines: readonly string[];
  conflicts: readonly string[];
  suggestions: readonly string[];
};
