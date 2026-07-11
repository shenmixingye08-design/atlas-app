import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { authorizeAutomationTick } from "./tick-auth";

describe("authorizeAutomationTick", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null });
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
  });

  it("accepts bearer cron secret", async () => {
    const request = new Request("https://example.com/api/automations/tick", {
      headers: { authorization: "Bearer cron-secret-value" },
    });
    await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
  });

  it("accepts signed-in clerk user", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    const request = new Request("https://example.com/api/automations/tick");
    await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
  });

  it("rejects missing credentials", async () => {
    const request = new Request("https://example.com/api/automations/tick");
    await expect(authorizeAutomationTick(request)).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
