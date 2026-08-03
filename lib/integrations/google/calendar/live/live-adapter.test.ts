import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { googleServiceDefinition } from "@/lib/integrations/google/definition";
import { googleCalendarLiveAdapter } from "@/lib/integrations/google/calendar/live/adapter";
import {
  getCalendarAdapterMetrics,
  resetCalendarLiveMetricsForTests,
} from "@/lib/integrations/google/calendar/live/metrics";
import { resetCalendarIdempotencyForTests } from "@/lib/integrations/google/calendar/live/idempotency";
import { validateCalendarDateTime } from "@/lib/integrations/google/calendar/live/datetime";
import { resolveCalendarAttendees } from "@/lib/integrations/google/calendar/live/attendees";
import { buildRrule, resolveCalendarRecurrence } from "@/lib/integrations/google/calendar/live/recurrence";
import { classifyCalendarProviderError } from "@/lib/integrations/google/calendar/live/retry";
import {
  encryptGoogleSecret,
  decryptGoogleSecret,
} from "@/lib/integrations/google/crypto";
import { buildGoogleAccountAuthorizeUrl } from "@/lib/integrations/google/oauth";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";

const OWNER = "user_calendar_live_owner";

function connectedGoogle(
  scope = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].join(" "),
) {
  saveExternalServiceCredentials({
    userId: OWNER,
    serviceId: "google",
    accessToken: "access-cal-live",
    refreshToken: "refresh-cal-live",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scope,
    updatedAt: new Date().toISOString(),
  });
  saveExternalServiceConnection(OWNER, {
    ...createDefaultConnection(googleServiceDefinition),
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    scopes: scope.split(" "),
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: "owner@example.com",
      name: "Owner",
      pictureUrl: null,
    },
  });
}

function eventPayload(input: {
  id: string;
  summary: string;
  start: string;
  end: string;
  timezone?: string;
  attendees?: string[];
  htmlLink?: string;
  hangoutLink?: string | null;
  status?: string;
  recurrence?: string[];
}) {
  return {
    id: input.id,
    status: input.status ?? "confirmed",
    summary: input.summary,
    htmlLink: input.htmlLink ?? `https://calendar.google.com/event?eid=${input.id}`,
    hangoutLink: input.hangoutLink ?? null,
    start: { dateTime: input.start, timeZone: input.timezone ?? "Asia/Tokyo" },
    end: { dateTime: input.end, timeZone: input.timezone ?? "Asia/Tokyo" },
    attendees: (input.attendees ?? []).map((email) => ({ email })),
    recurrence: input.recurrence ?? [],
  };
}

describe("Google Calendar Production Live Adapter", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetCalendarIdempotencyForTests();
    resetCalendarLiveMetricsForTests();
    vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret-calendar-live");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
    vi.stubEnv(
      "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers google_calendar in Production registry", () => {
    expect(isLiveAdapterWired("google_calendar")).toBe(true);
    expect(getCapability("google_calendar")?.enabled).toBe(true);
  });

  it("uses PKCE and encrypts tokens", () => {
    const url = buildGoogleAccountAuthorizeUrl("http://localhost:3000", OWNER);
    expect(url).toContain("code_challenge=");
    const cipher = encryptGoogleSecret("refresh-plain");
    expect(decryptGoogleSecret(cipher)).toBe("refresh-plain");
  });

  it("validates datetime and DST-sensitive inputs", () => {
    const ok = validateCalendarDateTime({
      startDateTime: "2030-06-01T10:00:00.000Z",
      endDateTime: "2030-06-01T11:00:00.000Z",
      timezone: "Asia/Tokyo",
      allDay: false,
    });
    expect(ok.startDateTime).toBeTruthy();
    expect(() =>
      validateCalendarDateTime({
        startDateTime: "2030-06-01T12:00:00.000Z",
        endDateTime: "2030-06-01T11:00:00.000Z",
        timezone: "Asia/Tokyo",
        allDay: false,
      }),
    ).toThrow(/start must be before end/);
  });

  it("validates attendees and builds RRULE", () => {
    const attendees = resolveCalendarAttendees({
      attendees: "a@example.com, a@example.com; b@example.com",
      ownerEmail: "owner@example.com",
    });
    expect(attendees.attendees.map((item) => item.email)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    const recurrence = resolveCalendarRecurrence({
      frequency: "weekly",
      byWeekDay: ["MO", "WE"],
      count: 4,
    });
    expect(buildRrule(recurrence!)).toContain("FREQ=WEEKLY");
    expect(buildRrule(recurrence!)).toContain("BYDAY=MO,WE");
  });

  it("fails closed on missing connection and missing scope", async () => {
    const missing = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_cal",
      configuration: {
        action: "create",
        eventTitle: "Meeting",
        startDateTime: "2030-06-01T10:00:00.000Z",
        endDateTime: "2030-06-01T11:00:00.000Z",
        timezone: "Asia/Tokyo",
      },
      inputBindings: {},
      approved: true,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errorCode).toBe("calendar_not_connected");

    connectedGoogle("email profile");
    const scope = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_1",
      stepId: "step_cal",
      configuration: {
        action: "create",
        eventTitle: "Meeting",
        startDateTime: "2030-06-01T10:00:00.000Z",
        endDateTime: "2030-06-01T11:00:00.000Z",
        timezone: "Asia/Tokyo",
      },
      inputBindings: {},
      approved: true,
    });
    expect(scope.ok).toBe(false);
    if (!scope.ok) expect(scope.errorCode).toBe("calendar_missing_scope");
    expect(getCalendarAdapterMetrics().scopeErrorCount).toBeGreaterThan(0);
  });

  it("creates event with re-fetch verification and prevents duplicate", async () => {
    connectedGoogle();
    let createCount = 0;
    const start = "2030-06-01T01:00:00.000Z";
    const end = "2030-06-01T02:00:00.000Z";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/events?") && !init?.method) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (url.includes("/events") && init?.method === "POST") {
          createCount += 1;
          return new Response(
            JSON.stringify(
              eventPayload({
                id: "evt_1",
                summary: "Weekly Sync",
                start,
                end,
              }),
            ),
            { status: 200 },
          );
        }
        if (url.includes("/events/evt_1")) {
          return new Response(
            JSON.stringify(
              eventPayload({
                id: "evt_1",
                summary: "Weekly Sync",
                start,
                end,
              }),
            ),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: url } }), {
          status: 500,
        });
      }),
    );

    const first = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_c",
      stepId: "step_cal",
      configuration: {
        action: "create",
        eventTitle: "Weekly Sync",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        idempotencyKey: "cal_create_1",
      },
      inputBindings: {},
      approved: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected ok");
    expect(first.action.eventId).toBe("evt_1");
    expect(first.action.htmlLink).toContain("evt_1");

    const dup = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_c",
      stepId: "step_cal",
      configuration: {
        action: "create",
        eventTitle: "Weekly Sync",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        idempotencyKey: "cal_create_1",
      },
      inputBindings: {},
      approved: true,
    });
    expect(dup.ok).toBe(true);
    if (!dup.ok) throw new Error("expected ok");
    expect(dup.action.duplicatePrevented).toBe(true);
    expect(createCount).toBe(1);
  });

  it("approval gate: no invite before approve, then create once", async () => {
    connectedGoogle();
    let createCount = 0;
    const start = "2030-07-01T01:00:00.000Z";
    const end = "2030-07-01T02:00:00.000Z";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/events?") && !init?.method) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (url.includes("/events") && init?.method === "POST") {
          createCount += 1;
          return new Response(
            JSON.stringify(
              eventPayload({
                id: "evt_appr",
                summary: "Invite",
                start,
                end,
                attendees: ["guest@example.com"],
              }),
            ),
            { status: 200 },
          );
        }
        if (url.includes("/events/evt_appr")) {
          return new Response(
            JSON.stringify(
              eventPayload({
                id: "evt_appr",
                summary: "Invite",
                start,
                end,
                attendees: ["guest@example.com"],
              }),
            ),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: url } }), {
          status: 500,
        });
      }),
    );

    const waiting = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_appr",
      stepId: "step_cal",
      configuration: {
        action: "create",
        eventTitle: "Invite",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        attendees: "guest@example.com",
        idempotencyKey: "cal_appr_1",
      },
      inputBindings: {},
      approved: false,
    });
    expect(waiting.ok).toBe(true);
    if (!waiting.ok) throw new Error("expected ok");
    expect(waiting.awaitingApproval).toBe(true);
    expect(createCount).toBe(0);

    const created = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_appr",
      stepId: "step_cal",
      configuration: {
        action: "create",
        eventTitle: "Invite",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        attendees: "guest@example.com",
        idempotencyKey: "cal_appr_1",
      },
      inputBindings: {},
      approved: true,
      approvalId: "appr_1",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected ok");
    expect(created.action.eventId).toBe("evt_appr");
    expect(createCount).toBe(1);
  });

  it("updates and cancels with verification / idempotent cancel", async () => {
    connectedGoogle();
    const start = "2030-08-01T01:00:00.000Z";
    const end = "2030-08-01T02:00:00.000Z";
    let deleted = false;
    let summary = "Original";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/events/evt_upd") && init?.method === "PATCH") {
          summary = "Updated";
          return new Response(
            JSON.stringify(
              eventPayload({
                id: "evt_upd",
                summary,
                start,
                end,
              }),
            ),
            { status: 200 },
          );
        }
        if (url.includes("/events/evt_upd") && init?.method === "DELETE") {
          deleted = true;
          return new Response(null, { status: 204 });
        }
        if (url.includes("/events/evt_upd")) {
          if (deleted) {
            return new Response(
              JSON.stringify({ error: { message: "Not Found", code: 404 } }),
              { status: 404 },
            );
          }
          return new Response(
            JSON.stringify(
              eventPayload({
                id: "evt_upd",
                summary,
                start,
                end,
              }),
            ),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: url } }), {
          status: 500,
        });
      }),
    );

    const updated = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_u",
      stepId: "step_cal",
      configuration: {
        action: "update",
        eventId: "evt_upd",
        eventTitle: "Updated",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        approvalRequired: false,
        idempotencyKey: "cal_upd_1",
      },
      inputBindings: {},
      approved: true,
    });
    expect(updated.ok).toBe(true);

    const cancelled = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_x",
      stepId: "step_cal",
      configuration: {
        action: "cancel",
        eventId: "evt_upd",
        eventTitle: "Updated",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        approvalRequired: false,
        idempotencyKey: "cal_cancel_1",
      },
      inputBindings: {},
      approved: true,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) throw new Error("expected ok");
    expect(cancelled.action.status).toBe("cancelled");

    const cancelDup = await googleCalendarLiveAdapter.execute({
      ownerId: OWNER,
      runId: "run_x",
      stepId: "step_cal",
      configuration: {
        action: "cancel",
        eventId: "evt_upd",
        eventTitle: "Updated",
        startDateTime: start,
        endDateTime: end,
        timezone: "Asia/Tokyo",
        approvalRequired: false,
        idempotencyKey: "cal_cancel_1",
      },
      inputBindings: {},
      approved: true,
    });
    expect(cancelDup.ok).toBe(true);
    if (!cancelDup.ok) throw new Error("expected ok");
    expect(cancelDup.action.duplicatePrevented).toBe(true);
  });

  it("classifies retryable errors", () => {
    expect(classifyCalendarProviderError(new Error("429 rate limit")).retryable).toBe(
      true,
    );
    expect(
      classifyCalendarProviderError(new Error("invalid datetime")).retryable,
    ).toBe(false);
  });
});
