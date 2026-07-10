import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";

const TEST_USER_ID = "user_google_connect_test";

describe("externalServiceManager Google connect", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  });

  it("returns an authorize URL for Google OAuth", async () => {
    const context = buildFeatureAccessContext(null);
    const result = await externalServiceManager.connect(
      TEST_USER_ID,
      "google",
      "http://localhost:3000",
      context,
    );

    expect(result.connection.status).toBe("pending");
    expect(result.authorizeUrl).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(result.authorizeUrl).toContain("client_id=test-client-id");
    expect(result.authorizeUrl).toContain(
      encodeURIComponent(
        "http://localhost:3000/api/external-services/google/oauth/callback",
      ),
    );
  });

  it("requires request origin for Google OAuth", async () => {
    await expect(
      externalServiceManager.connect(TEST_USER_ID, "google"),
    ).rejects.toThrow(/origin/i);
  });
});
