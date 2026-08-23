/**
 * Permanent CI guard: Dropbox reconnect / cold start must not use
 * stale isolate memory or skip hydrate before the connection gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const durableByUser = vi.hoisted(() => new Map<string, unknown>());
const durableReadFailed = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/integrations/dropbox/credential-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/dropbox/credential-persistence")
  >("@/lib/integrations/dropbox/credential-persistence");
  return {
    ...actual,
    readDropboxAuthFromDurable: vi.fn(async (userId: string) => {
      if (durableReadFailed.has(userId)) {
        return {
          status: "unavailable" as const,
          developerCode: "durable_read_failed" as const,
          reason: "timeout",
        };
      }
      const row = durableByUser.get(userId);
      if (!row) return { status: "missing" as const };
      return { status: "found" as const, value: row };
    }),
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
import {
  getDropboxAccessToken,
  getDropboxAccessTokenResult,
} from "@/lib/integrations/dropbox/oauth-service";
import { getDropboxFilesForUser } from "@/lib/integrations/dropbox/service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";

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
    durableReadFailed.clear();
    resetExternalServiceStore();
    resetExternalServiceCredentialStore();
    resetExternalAuthHydration();
    resetFeatureFlagStore();
    setFeatureFlagState("dropbox", "on");
  });

  afterEach(() => {
    durableByUser.clear();
    durableReadFailed.clear();
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

  it("CASE C: disconnect on another isolate does not use stale Dropbox token", async () => {
    const stale = connectedDropbox(USER_A, "stale-dbx");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, stale);
    durableByUser.delete(USER_A);

    const token = await getDropboxAccessToken(USER_A);
    expect(token).toBeNull();
    expect(getExternalServiceCredentials(USER_A, "dropbox")).toBeNull();

    const files = await getDropboxFilesForUser({
      userId: USER_A,
      context: buildFeatureAccessContext(null),
    });
    expect(files.status).toBe("dropbox_not_connected");
  });

  it("CASE D: durable read failure is not dropbox_not_connected", async () => {
    const stale = connectedDropbox(USER_A, "stale-dbx");
    saveExternalServiceCredentials(stale.credentials);
    saveExternalServiceConnection(USER_A, stale.connection);
    durableByUser.set(USER_A, stale);
    durableReadFailed.add(USER_A);

    const result = await getDropboxAccessTokenResult(USER_A);
    expect(result.status).toBe("unavailable");
    expect(getExternalServiceCredentials(USER_A, "dropbox")?.accessToken).toBe(
      "stale-dbx",
    );

    const files = await getDropboxFilesForUser({
      userId: USER_A,
      context: buildFeatureAccessContext(null),
    });
    expect(files.status).toBe("durable_unavailable");
  });
});
