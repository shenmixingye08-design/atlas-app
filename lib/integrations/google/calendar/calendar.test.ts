import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import {
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import {
  computeFreeSlots,
  fetchGoogleCalendarEvents,
  normalizeGoogleCalendarEvent,
} from "@/lib/integrations/google/calendar/api-client";
import { buildCalendarAutomationTriggers } from "@/lib/integrations/google/calendar/automation-plan";
import {
  isCalendarRangeId,
  resolveCalendarRangeWindow,
} from "@/lib/integrations/google/calendar/ranges";
import { getGoogleCalendarEventsForUser } from "@/lib/integrations/google/calendar/service";

const TEST_USER_ID = "user_google_calendar_test";

describe("Google Calendar integration", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetFeatureFlagStore();
    setFeatureFlagState("google", "on");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes timed and all-day events", () => {
    const timed = normalizeGoogleCalendarEvent({
      id: "evt-1",
      summary: "Standup",
      location: "Room A",
      description: "Daily sync",
      start: { dateTime: "2026-07-09T01:00:00+09:00" },
      end: { dateTime: "2026-07-09T01:30:00+09:00" },
    });

    expect(timed).toEqual({
      id: "evt-1",
      title: "Standup",
      startAt: new Date("2026-07-09T01:00:00+09:00").toISOString(),
      endAt: new Date("2026-07-09T01:30:00+09:00").toISOString(),
      location: "Room A",
      isAllDay: false,
      description: "Daily sync",
      meetLink: null,
      htmlLink: null,
    });

    const allDay = normalizeGoogleCalendarEvent({
      id: "evt-2",
      start: { date: "2026-07-09" },
      end: { date: "2026-07-10" },
    });

    expect(allDay).toMatchObject({
      id: "evt-2",
      title: "(タイトルなし)",
      isAllDay: true,
      location: null,
      description: null,
    });
  });

  it("resolves calendar range ids and windows", () => {
    expect(isCalendarRangeId("today")).toBe(true);
    expect(isCalendarRangeId("invalid")).toBe(false);

    const now = new Date("2026-07-09T03:00:00.000Z");
    const today = resolveCalendarRangeWindow("today", now);
    expect(today.label).toBe("今日");
    expect(new Date(today.timeMin).getTime()).toBeLessThan(now.getTime());
    expect(new Date(today.timeMax).getTime()).toBeGreaterThan(now.getTime());
  });

  it("builds pre-notify and post-work automation triggers", () => {
    const now = new Date("2026-07-09T00:00:00.000Z");
    const triggers = buildCalendarAutomationTriggers(
      [
        {
          id: "evt-1",
          title: "Client call",
          startAt: "2026-07-09T02:00:00.000Z",
          endAt: "2026-07-09T03:00:00.000Z",
          location: null,
          isAllDay: false,
          description: null,
          meetLink: null,
          htmlLink: null,
        },
      ],
      { now, notifyMinutesBefore: 15 },
    );

    expect(triggers).toHaveLength(2);
    expect(triggers[0]?.kind).toBe("pre_event_notify");
    expect(triggers[1]?.kind).toBe("post_event_work");
  });

  it("returns google_not_connected when account is missing", async () => {
    const result = await getGoogleCalendarEventsForUser({
      userId: TEST_USER_ID,
      range: "today",
      context: { email: "test@example.com", isOwner: false, isBetaUser: true },
    });

    expect(result.status).toBe("google_not_connected");
    if (result.status === "google_not_connected") {
      expect(result.message).toBe("Googleを接続してください");
    }
  });

  it("returns feature_disabled when google flag is off", async () => {
    setFeatureFlagState("google", "off");

    const result = await getGoogleCalendarEventsForUser({
      userId: TEST_USER_ID,
      range: "today",
      context: { email: "regular@example.com", isOwner: false, isBetaUser: false },
    });

    expect(result.status).toBe("feature_disabled");
  });

  it("fetches events for connected users", async () => {
    const connection = getExternalServiceConnection(TEST_USER_ID, "google");
    saveExternalServiceConnection(TEST_USER_ID, {
      ...connection,
      status: "connected",
      connectedAt: new Date().toISOString(),
      account: {
        email: "user@example.com",
        name: "User",
        pictureUrl: null,
      },
    });

    saveExternalServiceCredentials({
      userId: TEST_USER_ID,
      serviceId: "google",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "calendar.readonly",
      updatedAt: new Date().toISOString(),
    });

    const fetchMock = vi.fn(async () =>
      Response.json({
        items: [
          {
            id: "evt-1",
            summary: "Review",
            start: { dateTime: "2026-07-09T05:00:00.000Z" },
            end: { dateTime: "2026-07-09T06:00:00.000Z" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getGoogleCalendarEventsForUser({
      userId: TEST_USER_ID,
      range: "today",
      context: { email: "beta@example.com", isOwner: false, isBetaUser: true },
      now: new Date("2026-07-09T03:00:00.000Z"),
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.events).toHaveLength(1);
      expect(result.snapshot.events[0]?.title).toBe("Review");
      expect(result.automationTriggers.length).toBeGreaterThan(0);
    }

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("googleapis.com/calendar/v3");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer access-token",
    });
  });

  it("throws when calendar API returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { message: "Calendar API failed" } },
          { status: 403 },
        ),
      ),
    );

    await expect(
      fetchGoogleCalendarEvents({
        accessToken: "token",
        timeMin: "2026-07-09T00:00:00.000Z",
        timeMax: "2026-07-10T00:00:00.000Z",
      }),
    ).rejects.toThrow("Calendar API failed");
  });

  it("computes free slots from busy intervals", () => {
    const slots = computeFreeSlots({
      timeMin: "2026-07-09T00:00:00+09:00",
      timeMax: "2026-07-09T23:59:00+09:00",
      busy: [
        {
          start: "2026-07-09T10:00:00+09:00",
          end: "2026-07-09T11:00:00+09:00",
        },
      ],
      slotMinutes: 30,
      dayStartHour: 9,
      dayEndHour: 12,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.some((slot) => slot.durationMinutes >= 30)).toBe(true);
  });
});
