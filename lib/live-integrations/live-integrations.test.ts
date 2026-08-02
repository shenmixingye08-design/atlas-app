import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimLiveActionOnce,
  fingerprintLiveAction,
  resetLiveDedupeForTests,
} from "@/lib/live-integrations/duplicate";
import { isRetryableLiveError } from "@/lib/live-integrations/retry";
import { capabilityIdsNeedingLiveIntegrations } from "@/lib/live-integrations/preflight";
import { countAutomationsByLiveService } from "@/lib/live-integrations/automation-counts";
import { liveAdapterToStepResult } from "@/lib/live-integrations/map-result";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";

vi.mock("@/lib/integrations/external-services/durable", () => ({
  ensureExternalAuthHydrated: vi.fn(async () => undefined),
}));

vi.mock("@/lib/integrations/external-services/store", () => ({
  getExternalServiceConnection: vi.fn((userId: string, serviceId: string) => {
    if (serviceId === "google" && userId === "user_connected") {
      return {
        serviceId: "google",
        serviceName: "Google",
        status: "connected",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: "2026-08-01T10:00:00.000Z",
        scopes: [
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/calendar",
        ],
        features: [],
        errorMessage: null,
      };
    }
    if (serviceId === "google" && userId === "user_expired") {
      return {
        serviceId: "google",
        serviceName: "Google",
        status: "error",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        scopes: [],
        features: [],
        errorMessage: "token expired / invalid_grant",
      };
    }
    if (serviceId === "dropbox" && userId === "user_connected") {
      return {
        serviceId: "dropbox",
        serviceName: "Dropbox",
        status: "connected",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: "2026-08-01T09:00:00.000Z",
        scopes: ["files.content.write"],
        features: [],
        errorMessage: null,
      };
    }
    if (serviceId === "wordpress" && userId === "user_scope") {
      return {
        serviceId: "wordpress",
        serviceName: "WordPress",
        status: "connected",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        scopes: [],
        features: [],
        errorMessage: null,
      };
    }
    if (serviceId === "x" && userId === "user_connected") {
      return {
        serviceId: "x",
        serviceName: "X",
        status: "connected",
        connectedAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: "2026-08-01T08:00:00.000Z",
        scopes: ["tweet.read", "tweet.write", "users.read"],
        features: [],
        errorMessage: null,
      };
    }
    return {
      serviceId,
      serviceName: serviceId,
      status: "disconnected",
      connectedAt: null,
      lastUsedAt: null,
      scopes: [],
      features: [],
      errorMessage: null,
    };
  }),
}));

vi.mock("@/lib/integrations/external-services/credential-store", () => ({
  getExternalServiceCredentials: vi.fn((userId: string, serviceId: string) => {
    if (userId === "user_connected" && serviceId === "google") {
      return {
        userId,
        serviceId,
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        scope:
          "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar",
        updatedAt: new Date().toISOString(),
      };
    }
    if (userId === "user_token_expired" && serviceId === "google") {
      return {
        userId,
        serviceId,
        accessToken: "access",
        refreshToken: "",
        expiresAt: new Date(Date.now() - 3600_000).toISOString(),
        scope: "gmail",
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  }),
}));

describe("Live Integrations", () => {
  beforeEach(() => {
    resetLiveDedupeForTests();
  });

  it("maps capabilities to live services", () => {
    expect(
      capabilityIdsNeedingLiveIntegrations([
        "gmail",
        "dropbox",
        "x_post",
        "notify",
      ]),
    ).toEqual(["gmail", "dropbox", "x"]);
  });

  it("prevents duplicate actions within TTL", () => {
    const fp = fingerprintLiveAction({
      userId: "u1",
      service: "gmail",
      action: "send",
      target: "a@example.com",
      content: "hello",
    });
    expect(claimLiveActionOnce(fp).duplicate).toBe(false);
    expect(claimLiveActionOnce(fp).duplicate).toBe(true);
  });

  it("classifies 429 as retryable and auth as non-retryable", () => {
    expect(isRetryableLiveError({ status: 429, message: "rate limit" })).toBe(
      true,
    );
    expect(
      isRetryableLiveError({ status: 401, message: "unauthorized reconnect" }),
    ).toBe(false);
  });

  it("counts automations per live service", () => {
    const counts = countAutomationsByLiveService([
      {
        workflow: {
          steps: [
            { type: "gmail", enabled: true },
            { type: "dropbox", enabled: true },
            { type: "gmail", enabled: true },
          ],
        },
      },
      {
        workflow: {
          steps: [{ type: "x_post", enabled: true }],
        },
      },
    ]);
    expect(counts.gmail).toBe(1);
    expect(counts.dropbox).toBe(1);
    expect(counts.x).toBe(1);
  });

  it("maps adapter failure with reconnect to step result", () => {
    const adapter: LiveAdapterResult = {
      ok: false,
      summary: "Gmailの再接続が必要です",
      externalId: null,
      url: null,
      errorCode: "token_expired",
      errorMessage: "expired",
      needsReconnect: true,
      retryable: false,
      skippedDuplicate: false,
    };
    const step = liveAdapterToStepResult("Gmail", adapter);
    expect(step.ok).toBe(false);
    expect(step.needsUserInput).toBe(true);
    expect(step.errorCode).toBe("token_expired");
  });

  it("reports connected / expired / not_connected statuses", async () => {
    const { getLiveIntegrationStatus } = await import(
      "@/lib/live-integrations/status"
    );

    const connected = await getLiveIntegrationStatus("user_connected", "gmail");
    expect(connected.status).toBe("connected");
    expect(connected.lastUsedAt).toBeTruthy();

    const calendar = await getLiveIntegrationStatus(
      "user_connected",
      "google_calendar",
    );
    expect(calendar.status).toBe("connected");

    const dropbox = await getLiveIntegrationStatus("user_connected", "dropbox");
    expect(dropbox.status).toBe("connected");

    const x = await getLiveIntegrationStatus("user_connected", "x");
    expect(x.status).toBe("connected");

    const expired = await getLiveIntegrationStatus("user_expired", "gmail");
    expect(expired.status).toBe("expired");
    expect(expired.reconnectHref).toBeTruthy();

    const missing = await getLiveIntegrationStatus("user_none", "wordpress");
    expect(missing.status).toBe("not_connected");
    expect(missing.connectHref).toBeTruthy();
  });

  it("preflight blocks when Dropbox is not connected", async () => {
    const { preflightLiveIntegrations } = await import(
      "@/lib/live-integrations/preflight"
    );
    const result = await preflightLiveIntegrations({
      userId: "user_none",
      capabilityIds: ["dropbox", "gmail"],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.serviceId === "dropbox")).toBe(true);
    expect(result.issues.find((i) => i.serviceId === "dropbox")?.actionLabel).toBe(
      "接続する",
    );
  });

  it("preflight passes when required services are connected", async () => {
    const { preflightLiveIntegrations } = await import(
      "@/lib/live-integrations/preflight"
    );
    const result = await preflightLiveIntegrations({
      userId: "user_connected",
      capabilityIds: ["gmail", "dropbox", "x_post"],
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects insufficient scope when scopesMissing are provided", async () => {
    const { getLiveIntegrationStatus } = await import(
      "@/lib/live-integrations/status"
    );
    const status = await getLiveIntegrationStatus("user_scope", "wordpress", {
      scopesMissing: ["posts.publish"],
    });
    expect(status.status).toBe("insufficient_scope");
    expect(status.reconnectHref).toBeTruthy();
  });
});
