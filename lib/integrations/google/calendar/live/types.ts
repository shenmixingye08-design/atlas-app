/**
 * Google Calendar Production Live Adapter — typed contracts.
 */

export const CALENDAR_ADAPTER_MODE = "production" as const;
export const CALENDAR_SERVICE_ID = "google_calendar" as const;

export const CALENDAR_ACTIONS = ["create", "update", "cancel"] as const;
export type CalendarLiveAction = (typeof CALENDAR_ACTIONS)[number];

export const CALENDAR_CONFLICT_POLICIES = ["allow", "warn", "fail"] as const;
export type CalendarConflictPolicy = (typeof CALENDAR_CONFLICT_POLICIES)[number];

/** Default: warn — record conflict but do not invent silent overwrite. */
export const DEFAULT_CALENDAR_CONFLICT_POLICY: CalendarConflictPolicy = "warn";

export const CALENDAR_CONNECTION_HEALTH = [
  "connected",
  "expired",
  "revoked",
  "missing_scope",
  "reconnect_required",
  "disabled",
  "error",
  "disconnected",
  "invalid",
] as const;

export type CalendarConnectionHealth =
  (typeof CALENDAR_CONNECTION_HEALTH)[number];

export type CalendarAttendeeInput = {
  email: string;
  optional: boolean;
};

export type CalendarReminderInput = {
  method: "popup" | "email";
  minutes: number;
};

export type CalendarRecurrenceInput = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  count: number | null;
  until: string | null;
  byWeekDay: string[];
};

export type CalendarStepInput = {
  action: CalendarLiveAction;
  calendarId: string;
  eventId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  allDay: boolean;
  attendees: CalendarAttendeeInput[];
  reminders: CalendarReminderInput[] | "default" | "none";
  recurrence: CalendarRecurrenceInput | null;
  conferenceType: "hangoutsMeet" | null;
  visibility: "default" | "public" | "private";
  transparency: "opaque" | "transparent";
  sendUpdates: "all" | "externalOnly" | "none";
  conflictPolicy: CalendarConflictPolicy;
  conferenceRequired: boolean;
  approvalRequired: boolean;
  idempotencyKey: string;
  ownerId: string;
  organizationId: string | null;
  runId: string;
  stepId: string;
  diagnosticId: string;
};

export type CalendarExternalAction = {
  externalActionId: string;
  service: typeof CALENDAR_SERVICE_ID;
  action: CalendarLiveAction;
  calendarId: string;
  eventId: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  titleHash: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  attendeeHash: string;
  status: "verified" | "awaiting_approval" | "cancelled";
  adapterMode: typeof CALENDAR_ADAPTER_MODE;
  environment: string;
  providerRequestId: string | null;
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  diagnosticId: string;
  resultHash: string;
  duplicatePrevented: boolean;
  approvalId: string | null;
  conflictWarned: boolean;
};

export type CalendarAdapterResult =
  | {
      ok: true;
      action: CalendarExternalAction;
      awaitingApproval: boolean;
      title: string;
      attendeeCount: number;
      changedFields?: string[];
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
      connectionHealth?: CalendarConnectionHealth;
      needsUserInput?: boolean;
      retryCount: number;
    };

export type CalendarRetryHistoryEntry = {
  attempt: number;
  at: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export type CalendarAdapterMetricsSnapshot = {
  createCount: number;
  updateCount: number;
  cancelCount: number;
  successRate: number;
  failureRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  retryRate: number;
  tokenRefreshRate: number;
  duplicatePreventedCount: number;
  approvalWaitCount: number;
  invalidDateCount: number;
  invalidAttendeeCount: number;
  scopeErrorCount: number;
  verificationFailureCount: number;
  conflictDetectedCount: number;
  latenciesMs: number[];
};
