import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const checkAtlasOwnerMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/auth/require-atlas-owner", () => ({
  checkAtlasOwner: () => checkAtlasOwnerMock(),
}));

import { authorizeAutomationTick } from "./tick-auth";

describe("authorizeAutomationTick", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: null });
    checkAtlasOwnerMock.mockResolvedValue(false);
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
    checkAtlasOwnerMock.mockReset();
  });

  it("accepts bearer cron secret", async () => {
    const request = new Request("https://example.com/api/automations/tick", {
      headers: { authorization: "Bearer cron-secret-value" },
    });
    await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
  });

  it("accepts signed-in clerk user outside production", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    const request = new Request("https://example.com/api/automations/tick");
    await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
  });

  it("rejects missing credentials outside production when secret is set", async () => {
    const request = new Request("https://example.com/api/automations/tick");
    await expect(authorizeAutomationTick(request)).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("rejects non-owner signed-in users in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    authMock.mockResolvedValue({ userId: "user_1" });
    checkAtlasOwnerMock.mockResolvedValue(false);
    const request = new Request("https://example.com/api/automations/tick");
    await expect(authorizeAutomationTick(request)).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("allows owner tick in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    checkAtlasOwnerMock.mockResolvedValue(true);
    const request = new Request("https://example.com/api/automations/tick");
    await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
  });
});
