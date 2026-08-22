import { describe, expect, it } from "vitest";

import { createDefaultXAutoPostSettings } from "./autopost-types";
import {
  countPostedAutoPostsThisMonth,
  hasConfiguredAutoPost,
  resolveXAutoPostLifecycle,
} from "./autopost-lifecycle";

const settings = createDefaultXAutoPostSettings("user_1");

describe("X auto-post lifecycle A–G", () => {
  it("A: disconnected users stay on the X workspace", () => {
    expect(
      resolveXAutoPostLifecycle({
        connectionStatus: "disconnected",
        settings,
        nextScheduledFor: null,
        lastRun: null,
      }),
    ).toBe("disconnected");
  });

  it("B: pending connect is connecting", () => {
    expect(
      resolveXAutoPostLifecycle({
        connectionStatus: "pending",
        settings,
        nextScheduledFor: null,
        lastRun: null,
      }),
    ).toBe("connecting");
  });

  it("C: connected but unset", () => {
    expect(hasConfiguredAutoPost(settings)).toBe(false);
    expect(
      resolveXAutoPostLifecycle({
        connectionStatus: "connected",
        settings,
        nextScheduledFor: null,
        lastRun: null,
      }),
    ).toBe("connected_unset");
  });

  it("E: enabled + next run is waiting", () => {
    expect(
      resolveXAutoPostLifecycle({
        connectionStatus: "connected",
        settings: { ...settings, enabled: true, updatedAt: "later" },
        nextScheduledFor: "2026-08-23T01:00:00.000Z",
        lastRun: null,
      }),
    ).toBe("waiting");
  });

  it("F/G: last posted vs failed", () => {
    const posted = {
      id: "r1",
      userId: "user_1",
      slotKey: "slot",
      scheduledFor: null,
      status: "posted" as const,
      mode: "full_auto" as const,
      postType: null,
      text: "hello",
      tweetId: "1",
      tweetUrl: "https://x.com/1",
      errorMessage: null,
      createdAt: "2026-08-22T01:00:00.000Z",
      updatedAt: "2026-08-22T01:00:00.000Z",
    };
    expect(
      resolveXAutoPostLifecycle({
        connectionStatus: "connected",
        settings: { ...settings, enabled: true, updatedAt: "later" },
        nextScheduledFor: "2026-08-23T01:00:00.000Z",
        lastRun: posted,
      }),
    ).toBe("succeeded");
    expect(
      resolveXAutoPostLifecycle({
        connectionStatus: "connected",
        settings: { ...settings, enabled: true, updatedAt: "later" },
        nextScheduledFor: "2026-08-23T01:00:00.000Z",
        lastRun: { ...posted, status: "failed", errorMessage: "api" },
      }),
    ).toBe("failed");
  });

  it("counts only posted runs this month", () => {
    const now = new Date("2026-08-22T00:00:00.000Z");
    expect(
      countPostedAutoPostsThisMonth(
        [
          {
            id: "1",
            userId: "u",
            slotKey: "a",
            scheduledFor: null,
            status: "posted",
            mode: "full_auto",
            postType: null,
            text: "ok",
            tweetId: "1",
            tweetUrl: null,
            errorMessage: null,
            createdAt: "2026-08-10T00:00:00.000Z",
            updatedAt: "2026-08-10T00:00:00.000Z",
          },
          {
            id: "2",
            userId: "u",
            slotKey: "b",
            scheduledFor: null,
            status: "failed",
            mode: "full_auto",
            postType: null,
            text: null,
            tweetId: null,
            tweetUrl: null,
            errorMessage: "x",
            createdAt: "2026-08-11T00:00:00.000Z",
            updatedAt: "2026-08-11T00:00:00.000Z",
          },
        ],
        now,
      ),
    ).toBe(1);
  });
});
