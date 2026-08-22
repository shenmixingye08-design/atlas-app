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

function requestWith(
  headers: Record<string, string> = {},
): Request {
  return new Request("https://example.com/api/automations/tick", { headers });
}

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
    const gate = await authorizeAutomationTick(
      requestWith({ authorization: "Bearer cron-secret-value" }),
    );
    expect(gate).toMatchObject({
      ok: true,
      authMethod: "bearer_cron_secret",
    });
    expect(gate.tickId).toMatch(/^tick_/);
  });

  it("accepts x-cron-secret header", async () => {
    const gate = await authorizeAutomationTick(
      requestWith({ "x-cron-secret": "cron-secret-value" }),
    );
    expect(gate).toMatchObject({
      ok: true,
      authMethod: "x_cron_secret",
    });
  });

  it("labels GitHub Actions scheduler when header is present", async () => {
    const gate = await authorizeAutomationTick(
      requestWith({
        authorization: "Bearer cron-secret-value",
        "x-atlas-scheduler": "github-actions",
      }),
    );
    expect(gate).toMatchObject({
      ok: true,
      callerType: "internal_scheduler",
    });
  });

  it("labels Vercel Cron when x-vercel-cron is present", async () => {
    const gate = await authorizeAutomationTick(
      requestWith({
        authorization: "Bearer cron-secret-value",
        "x-vercel-cron": "1",
      }),
    );
    expect(gate).toMatchObject({
      ok: true,
      callerType: "vercel_cron",
    });
  });

  it("rejects invalid secret", async () => {
    await expect(
      authorizeAutomationTick(
        requestWith({ authorization: "Bearer wrong-secret" }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      status: 401,
      rejectionReason: "secret_mismatch",
    });
  });

  it("rejects missing secret", async () => {
    await expect(authorizeAutomationTick(requestWith())).resolves.toMatchObject({
      ok: false,
      status: 401,
      rejectionReason: "missing_credentials",
    });
  });

  it("rejects a normal external request", async () => {
    await expect(
      authorizeAutomationTick(
        new Request("https://atlasapp.jp/api/automations/tick", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      status: 401,
      callerType: "external",
    });
  });

  it("accepts signed-in clerk user outside production", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    await expect(authorizeAutomationTick(requestWith())).resolves.toMatchObject({
      ok: true,
      authMethod: "signed_in_preview",
    });
  });

  it("rejects missing credentials outside production when secret is set", async () => {
    await expect(authorizeAutomationTick(requestWith())).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("rejects non-owner signed-in users in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    authMock.mockResolvedValue({ userId: "user_1" });
    checkAtlasOwnerMock.mockResolvedValue(false);
    await expect(authorizeAutomationTick(requestWith())).resolves.toMatchObject({
      ok: false,
      status: 401,
      rejectionReason: "missing_credentials",
    });
  });

  it("allows owner tick in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    checkAtlasOwnerMock.mockResolvedValue(true);
    await expect(authorizeAutomationTick(requestWith())).resolves.toMatchObject({
      ok: true,
      authMethod: "atlas_owner_session",
    });
  });

  it("accepts valid cron secret in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      authorizeAutomationTick(
        requestWith({ authorization: "Bearer cron-secret-value" }),
      ),
    ).resolves.toMatchObject({ ok: true, authMethod: "bearer_cron_secret" });
  });

  it("rejects invalid cron secret in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      authorizeAutomationTick(
        requestWith({ authorization: "Bearer not-the-secret" }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      status: 401,
      rejectionReason: "secret_mismatch",
    });
  });

  it("treats Vercel Preview like production because NODE_ENV is production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    authMock.mockResolvedValue({ userId: "user_preview" });
    checkAtlasOwnerMock.mockResolvedValue(false);
    await expect(authorizeAutomationTick(requestWith())).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    await expect(
      authorizeAutomationTick(
        requestWith({ authorization: "Bearer cron-secret-value" }),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("never logs the secret value", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await authorizeAutomationTick(
      requestWith({ authorization: "Bearer cron-secret-value" }),
    );
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).not.toContain("cron-secret-value");
    expect(serialized).toContain("AUTOMATION_TICK_AUTH");
    info.mockRestore();
  });
});
