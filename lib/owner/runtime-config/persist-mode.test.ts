import { afterEach, describe, expect, it, vi } from "vitest";

import { getOwnerRuntimePersistMode } from "./persist-mode";

describe("getOwnerRuntimePersistMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses durable mode when service role is configured", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getOwnerRuntimePersistMode()).toBe("durable");
  });

  it("blocks production mutations without a durable store", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getOwnerRuntimePersistMode()).toBe("blocked");
  });

  it("allows memory-only mutations outside production", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    expect(getOwnerRuntimePersistMode()).toBe("memory");
  });
});
