import { beforeEach, describe, expect, it, vi } from "vitest";

import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

vi.mock("@/lib/live-integrations/adapters/gmail", () => ({
  executeGmailLive: vi.fn(async () => ({
    ok: true,
    summary: "Gmail下書きを保存しました",
    externalId: "draft_1",
    url: null,
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  })),
}));

vi.mock("@/lib/live-integrations/adapters/dropbox", () => ({
  executeDropboxLive: vi.fn(async () => ({
    ok: true,
    summary: "Dropboxに保存しました",
    externalId: "id:abc",
    url: null,
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  })),
}));

vi.mock("@/lib/live-integrations/adapters/calendar", () => ({
  executeCalendarLive: vi.fn(async () => ({
    ok: true,
    summary: "カレンダー予定を作成しました",
    externalId: "evt_1",
    url: "https://calendar.google.com",
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  })),
}));

vi.mock("@/lib/live-integrations/adapters/wordpress", () => ({
  executeWordPressLive: vi.fn(async () => ({
    ok: true,
    summary: "WordPressに下書き保存しました",
    externalId: "12",
    url: "https://example.com/?p=12",
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  })),
}));

vi.mock("@/lib/live-integrations/adapters/x", () => ({
  executeXLive: vi.fn(async () => ({
    ok: true,
    summary: "Xに投稿しました",
    externalId: "tweet_1",
    url: "https://x.com/i/status/tweet_1",
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  })),
}));

vi.mock("@/lib/live-integrations/preflight", () => ({
  preflightLiveIntegrations: vi.fn(async () => ({
    ok: true,
    issues: [],
    checkedAt: new Date().toISOString(),
  })),
}));

function step(
  type: AutomationWorkflowStep["type"],
  configuration: Record<string, unknown>,
): AutomationWorkflowStep {
  return {
    id: `step_${type}`,
    type,
    name: type,
    order: 1,
    inputBindings: {},
    configuration,
    requiresApproval: true,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 60_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

describe("strictStepInvoker live adapters", () => {
  beforeEach(() => {
    process.env.AUTOMATION_E2E_LIVE_EXTERNAL = "true";
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsec";
    process.env.X_CLIENT_ID = "xid";
    process.env.X_CLIENT_SECRET = "xsec";
    process.env.DROPBOX_CLIENT_ID = "did";
    process.env.DROPBOX_CLIENT_SECRET = "dsec";
    process.env.ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY = "wp-key";
  });

  it("requires approval for gmail", async () => {
    const result = await strictStepInvoker({
      step: step("gmail", { to: "a@example.com", subject: "hi", body: "body" }),
      userId: "user_1",
      automationName: "mail job",
      runId: "run_1",
      approved: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("automation_approval_required");
  });

  it("invokes live gmail adapter when approved", async () => {
    const result = await strictStepInvoker({
      step: step("gmail", {
        to: "a@example.com",
        subject: "hi",
        body: "body",
        mode: "draft",
      }),
      userId: "user_1",
      automationName: "mail job",
      runId: "run_1",
      approved: true,
    });
    expect(result.ok).toBe(true);
    expect(result.artifacts[0]?.externalId).toBe("draft_1");
  });

  it("invokes dropbox / calendar / wordpress / x adapters", async () => {
    const dropbox = await strictStepInvoker({
      step: step("dropbox", {
        saveTarget: "/ATLAS",
        fileName: "a.txt",
        content: "hello",
      }),
      userId: "user_1",
      automationName: "save",
      runId: "run_2",
      approved: true,
    });
    expect(dropbox.ok).toBe(true);

    const calendar = await strictStepInvoker({
      step: step("google_calendar", {
        title: "Meeting",
        startAt: "2026-08-02T10:00:00+09:00",
        endAt: "2026-08-02T11:00:00+09:00",
        attendees: ["b@example.com"],
        remindMinutesBefore: 15,
        timeZone: "Asia/Tokyo",
      }),
      userId: "user_1",
      automationName: "cal",
      runId: "run_3",
      approved: true,
    });
    expect(calendar.ok).toBe(true);

    const wp = await strictStepInvoker({
      step: step("wordpress", {
        title: "Post",
        content: "Body",
        status: "draft",
        categories: [1],
        tags: [2],
      }),
      userId: "user_1",
      automationName: "wp",
      runId: "run_4",
      approved: true,
    });
    expect(wp.ok).toBe(true);

    const x = await strictStepInvoker({
      step: step("x_post", { text: "hello from atlas" }),
      userId: "user_1",
      automationName: "x",
      runId: "run_5",
      approved: true,
    });
    expect(x.ok).toBe(true);
  });

  it("fails closed when live flag is off", async () => {
    process.env.AUTOMATION_E2E_LIVE_EXTERNAL = "false";
    const result = await strictStepInvoker({
      step: step("gmail", { to: "a@example.com", body: "x" }),
      userId: "user_1",
      automationName: "mail",
      runId: "run_6",
      approved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("automation_feature_disabled");
  });
});
