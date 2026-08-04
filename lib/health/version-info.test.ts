import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealthVersionPayload } from "@/lib/health/version-info";

describe("getHealthVersionPayload", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns Vercel commit identity without secrets", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef0123456789");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "atlas.example.vercel.app");
    vi.stubEnv("npm_package_version", "0.1.0");

    const payload = getHealthVersionPayload(new Date("2026-07-27T12:00:00.000Z"));

    expect(payload).toEqual({
      ok: true,
      environment: "production",
      commitSha: "abcdef0123456789",
      commitShaShort: "abcdef0",
      buildTime: "2026-07-27T12:00:00.000Z",
      appVersion: "0.1.0",
      vercelUrl: "atlas.example.vercel.app",
    });
    expect(JSON.stringify(payload)).not.toMatch(/sk_|secret|token|password/i);
  });

  it("falls back safely when Vercel env is missing", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");

    const payload = getHealthVersionPayload(new Date("2026-07-27T12:00:00.000Z"));
    expect(payload.ok).toBe(true);
    expect(payload.commitSha).toBe("unknown");
    expect(payload.environment).toBe("test");
  });
});
