/**
 * Permanent CI guard: Dropbox reconnect / cold start must not use
 * stale isolate memory or skip hydrate before the connection gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/integrations/dropbox/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/dropbox/credential-persistence")
  >("@/lib/integrations/dropbox/credential-persistence");
  return {
    ...actual,
    loadDropboxAuthFromSupabase: vi.fn(async (userId: string) => {
      return durableByUser.get(userId) ?? null;
    }),
    persistDropboxAuthToSupabase: vi.fn(async () => true),
  };
});

import {
  getExternalServiceCredentials,
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import {
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";
import { dropboxServiceDefinition } from "@/lib/integrations/dropbox/definition";
import { getDropboxAccessToken } from "@/lib/integrations/dropbox/oauth-service";

const USER_A = "user_dbx_stale_a";
const USER_B = "user_dbx_stale_b";

function connectedDropbox(userId: string, accessToken: string) {
  return {
    credentials: {
      userId,
      serviceId: "dropbox" as const,
      accessToken,
      refreshToken: `${accessToken}-refresh`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "files.content.read",
      updatedAt: new Date().toISOString(),
    },
    connection: {
      ...createDefaultConnection(dropboxServiceDefinition),
      status: "connected" as const,
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      scopes: ["files.content.read"],
      features: [...dropboxServiceDefinition.plannedFeatures],
      errorMessage: null,
      account: {
        email: `${userId}@example.com`,
        name: "A",
        pictureUrl: null,
        username: userId,
      },
    },
  };
}

describe("Dropbox reconnect stale token (permanent)", () => {
  beforeEach(() => {
    durableByUser.clear();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
  });

  afterEach(() => {
    durableByUser.clear();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
  });

  it("CASE A: durable token wins over stale isolate memory", async () => {
    const stale = connectedDropbox(USER_A, "stale-dbx");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, connectedDropbox(USER_A, "fresh-dbx"));

    const token = await getDropboxAccessToken(USER_A);
    expect(token).toBe("fresh-dbx");
    expect(getExternalServiceCredentials(USER_A, "dropbox")?.accessToken).toBe(
      "fresh-dbx",
    );
  });

  it("CASE B: other user token is not read", async () => {
    durableByUser.set(USER_A, connectedDropbox(USER_A, "a-dbx"));
    durableByUser.set(USER_B, connectedDropbox(USER_B, "b-dbx"));
    const token = await getDropboxAccessToken(USER_A);
    expect(token).toBe("a-dbx");
    expect(token).not.toBe("b-dbx");
  });
});
