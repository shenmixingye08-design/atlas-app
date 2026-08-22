/**
 * Permanent CI guard: WordPress reconnect must not post with a stale
 * Application Password cached on another serverless isolate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/integrations/wordpress/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/wordpress/credential-persistence")
  >("@/lib/integrations/wordpress/credential-persistence");
  return {
    ...actual,
    loadWordPressAuthFromSupabase: vi.fn(async (userId: string) => {
      return durableByUser.get(userId) ?? null;
    }),
    persistWordPressAuthToSupabase: vi.fn(async () => true),
    deleteWordPressAuthFromSupabase: vi.fn(async (userId: string) => {
      durableByUser.delete(userId);
      return true;
    }),
  };
});

import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { wordpressServiceDefinition } from "@/lib/integrations/wordpress/definition";
import {
  getWordPressAuthContext,
  resolveWordPressAuthContext,
} from "@/lib/integrations/wordpress/connection-service";
import {
  resetWordPressCredentialStore,
  saveWordPressCredentials,
} from "@/lib/integrations/wordpress/credential-store";

const USER_A = "user_wp_stale_a";
const USER_B = "user_wp_stale_b";

function connectedWp(userId: string, password: string) {
  return {
    credentials: {
      userId,
      siteUrl: `https://${userId}.example.com`,
      username: `${userId}-editor`,
      applicationPassword: password,
      updatedAt: new Date().toISOString(),
    },
    connection: {
      ...createDefaultConnection(wordpressServiceDefinition),
      status: "connected" as const,
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      scopes: [...wordpressServiceDefinition.plannedScopes],
      features: [...wordpressServiceDefinition.plannedFeatures],
      errorMessage: null,
      account: {
        email: `https://${userId}.example.com`,
        name: userId,
        pictureUrl: null,
        username: `${userId}-editor`,
      },
    },
  };
}

describe("WordPress reconnect stale credential (permanent)", () => {
  beforeEach(() => {
    durableByUser.clear();
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    resetExternalAuthHydration();
  });

  afterEach(() => {
    durableByUser.clear();
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    resetExternalAuthHydration();
  });

  it("CASE A: durable password wins over stale isolate memory", async () => {
    const stale = connectedWp(USER_A, "old-app-password-xxxx");
    saveWordPressCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, connectedWp(USER_A, "new-app-password-yyyy"));

    const ctx = await resolveWordPressAuthContext(USER_A);
    expect(ctx?.applicationPassword).toBe("new-app-password-yyyy");
    expect(getWordPressAuthContext(USER_A)?.applicationPassword).toBe(
      "new-app-password-yyyy",
    );
  });

  it("CASE B: other user password is not read", async () => {
    durableByUser.set(USER_A, connectedWp(USER_A, "a-password"));
    durableByUser.set(USER_B, connectedWp(USER_B, "b-password"));
    const ctx = await resolveWordPressAuthContext(USER_A);
    expect(ctx?.applicationPassword).toBe("a-password");
    expect(ctx?.applicationPassword).not.toBe("b-password");
    expect(ctx?.siteUrl).toBe("https://user_wp_stale_a.example.com");
  });
});
