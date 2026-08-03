/**
 * Contract measurement: Create 10 / Update 5 / Cancel 5 with mocked Calendar API.
 */

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

const OWNER = "user_calendar_measure";

describe("Calendar Live Adapter measurement (mocked provider)", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetCalendarIdempotencyForTests();
    resetCalendarLiveMetricsForTests();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
    vi.stubEnv(
      "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const scope = [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" ");
    saveExternalServiceCredentials({
      userId: OWNER,
      serviceId: "google",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
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
      account: { email: "owner@example.com", name: "O", pictureUrl: null },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records create/update/cancel with duplicate prevention", async () => {
    const creates = new Set<string>();
    const store = new Map<
      string,
      { summary: string; start: string; end: string; status: string }
    >();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/events?") && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (url.includes("/events") && init?.method === "POST") {
          const id = `evt_c_${creates.size + 1}`;
          creates.add(id);
          const body = JSON.parse(String(init.body ?? "{}")) as {
            summary?: string;
            start?: { dateTime?: string };
            end?: { dateTime?: string };
          };
          store.set(id, {
            summary: body.summary ?? "",
            start: body.start?.dateTime ?? "",
            end: body.end?.dateTime ?? "",
            status: "confirmed",
          });
          return new Response(
            JSON.stringify({
              id,
              status: "confirmed",
              summary: body.summary,
              htmlLink: `https://calendar.google.com/event?eid=${id}`,
              start: { dateTime: body.start?.dateTime, timeZone: "Asia/Tokyo" },
              end: { dateTime: body.end?.dateTime, timeZone: "Asia/Tokyo" },
              attendees: [],
            }),
            { status: 200 },
          );
        }
        const eventMatch = url.match(/\/events\/([^?/]+)/);
        const eventId = eventMatch?.[1];
        if (eventId && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body ?? "{}")) as {
            summary?: string;
            start?: { dateTime?: string };
            end?: { dateTime?: string };
          };
          store.set(eventId, {
            summary: body.summary ?? "",
            start: body.start?.dateTime ?? "",
            end: body.end?.dateTime ?? "",
            status: "confirmed",
          });
          return new Response(
            JSON.stringify({
              id: eventId,
              status: "confirmed",
              summary: body.summary,
              htmlLink: `https://calendar.google.com/event?eid=${eventId}`,
              start: { dateTime: body.start?.dateTime, timeZone: "Asia/Tokyo" },
              end: { dateTime: body.end?.dateTime, timeZone: "Asia/Tokyo" },
              attendees: [],
            }),
            { status: 200 },
          );
        }
        if (eventId && init?.method === "DELETE") {
          const current = store.get(eventId);
          if (current) current.status = "cancelled";
          return new Response(null, { status: 204 });
        }
        if (eventId) {
          const current = store.get(eventId);
          if (!current || current.status === "cancelled") {
            return new Response(
              JSON.stringify({ error: { message: "Not Found", code: 404 } }),
              { status: 404 },
            );
          }
          return new Response(
            JSON.stringify({
              id: eventId,
              status: current.status,
              summary: current.summary,
              htmlLink: `https://calendar.google.com/event?eid=${eventId}`,
              start: { dateTime: current.start, timeZone: "Asia/Tokyo" },
              end: { dateTime: current.end, timeZone: "Asia/Tokyo" },
              attendees: [],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: url } }), {
          status: 500,
        });
      }),
    );

    for (let i = 0; i < 10; i += 1) {
      const start = `2031-01-${String(i + 1).padStart(2, "0")}T01:00:00.000Z`;
      const end = `2031-01-${String(i + 1).padStart(2, "0")}T02:00:00.000Z`;
      const result = await googleCalendarLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_c_${i}`,
        stepId: "step_c",
        configuration: {
          action: "create",
          eventTitle: `Create ${i}`,
          startDateTime: start,
          endDateTime: end,
          timezone: "Asia/Tokyo",
          idempotencyKey: `create_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(result.ok).toBe(true);
      const dup = await googleCalendarLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_c_${i}`,
        stepId: "step_c",
        configuration: {
          action: "create",
          eventTitle: `Create ${i}`,
          startDateTime: start,
          endDateTime: end,
          timezone: "Asia/Tokyo",
          idempotencyKey: `create_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    for (let i = 0; i < 5; i += 1) {
      const eventId = `evt_c_${i + 1}`;
      const start = `2031-01-${String(i + 1).padStart(2, "0")}T01:00:00.000Z`;
      const end = `2031-01-${String(i + 1).padStart(2, "0")}T02:30:00.000Z`;
      const result = await googleCalendarLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_u_${i}`,
        stepId: "step_u",
        configuration: {
          action: "update",
          eventId,
          eventTitle: `Updated ${i}`,
          startDateTime: start,
          endDateTime: end,
          timezone: "Asia/Tokyo",
          approvalRequired: false,
          idempotencyKey: `update_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(result.ok).toBe(true);
    }

    for (let i = 0; i < 5; i += 1) {
      const eventId = `evt_c_${i + 1}`;
      const result = await googleCalendarLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_x_${i}`,
        stepId: "step_x",
        configuration: {
          action: "cancel",
          eventId,
          eventTitle: `Updated ${i}`,
          startDateTime: `2031-01-${String(i + 1).padStart(2, "0")}T01:00:00.000Z`,
          endDateTime: `2031-01-${String(i + 1).padStart(2, "0")}T02:30:00.000Z`,
          timezone: "Asia/Tokyo",
          approvalRequired: false,
          idempotencyKey: `cancel_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(result.ok).toBe(true);
      const dup = await googleCalendarLiveAdapter.execute({
        ownerId: OWNER,
        runId: `run_x_${i}`,
        stepId: "step_x",
        configuration: {
          action: "cancel",
          eventId,
          eventTitle: `Updated ${i}`,
          startDateTime: `2031-01-${String(i + 1).padStart(2, "0")}T01:00:00.000Z`,
          endDateTime: `2031-01-${String(i + 1).padStart(2, "0")}T02:30:00.000Z`,
          timezone: "Asia/Tokyo",
          approvalRequired: false,
          idempotencyKey: `cancel_${i}`,
        },
        inputBindings: {},
        approved: true,
      });
      expect(dup.ok).toBe(true);
      if (dup.ok) expect(dup.action.duplicatePrevented).toBe(true);
    }

    expect(creates.size).toBe(10);
    const metrics = getCalendarAdapterMetrics();
    expect(metrics.createCount).toBeGreaterThanOrEqual(10);
    expect(metrics.updateCount).toBeGreaterThanOrEqual(5);
    expect(metrics.cancelCount).toBeGreaterThanOrEqual(5);
    expect(metrics.duplicatePreventedCount).toBeGreaterThanOrEqual(15);
    expect(metrics.successRate).toBeGreaterThan(0.9);
  });
});
