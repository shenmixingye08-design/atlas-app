import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/x-oauth-connect/route";
import { EXPECTED_X_PRODUCTION_REDIRECT_URI } from "@/lib/integrations/x/config";

describe("GET /api/health/x-oauth-connect", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns booleans only and never echoes secret values", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("X_CLIENT_ID", "atlas-x-client-id-value");
    vi.stubEnv("X_CLIENT_SECRET", "atlas-x-client-secret-value");
    vi.stubEnv("X_REDIRECT_URI", EXPECTED_X_PRODUCTION_REDIRECT_URI);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_clerk_value_must_not_leak");

    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.xClientIdConfigured).toBe(true);
    expect(body.xClientSecretConfigured).toBe(true);
    expect(body.xRedirectUriConfigured).toBe(true);
    expect(body.expectedRedirectUri).toBe(EXPECTED_X_PRODUCTION_REDIRECT_URI);
    expect(body.canStartAuthorize).toBe(true);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("atlas-x-client-id-value");
    expect(serialized).not.toContain("atlas-x-client-secret-value");
    expect(serialized).not.toContain("sk_clerk_value_must_not_leak");
    expect(serialized).not.toMatch(/X_CLIENT_SECRET\s*=/);
  });

  it("is 503 when X_CLIENT_ID is missing", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("X_CLIENT_ID", "");
    vi.stubEnv("X_CLIENT_SECRET", "present");
    vi.stubEnv("CLERK_SECRET_KEY", "sk");

    const response = await GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.xClientIdConfigured).toBe(false);
    expect(body.canStartAuthorize).toBe(false);
    expect(JSON.stringify(body)).not.toContain("present");
  });
});
