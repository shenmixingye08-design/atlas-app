import "server-only";

import {
  getExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "../external-services/credential-store";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import {
  ensureExternalAuthHydrated,
  schedulePersistExternalAuth,
} from "../external-services/durable";

import { persistXAuthToSupabase } from "./credential-persistence";
import { X_RECONNECT_REQUIRED_MESSAGE } from "./errors";
import { refreshXAccessToken } from "./oauth";
import { markXConnectionNeedsReconnect } from "./oauth-service";

export type XAccessTokenResult =
  | { status: "ready"; accessToken: string }
  | { status: "missing" }
  | { status: "refresh_failed"; message: string };

/** Returns a valid access token, refreshing when expired. */
export async function getXAccountAccessTokenResult(
  userId: string,
): Promise<XAccessTokenResult> {
  await ensureExternalAuthHydrated(userId);
  const credentials = getExternalServiceCredentials(userId, "x");
  if (!credentials?.refreshToken) return { status: "missing" };

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (
    Number.isFinite(expiresAtMs) &&
    Date.now() < expiresAtMs - bufferMs &&
    credentials.accessToken
  ) {
    return { status: "ready", accessToken: credentials.accessToken };
  }

  try {
    const refreshed = await refreshXAccessToken(credentials.refreshToken);
    if (!refreshed.access_token) {
      markXConnectionNeedsReconnect(userId, X_RECONNECT_REQUIRED_MESSAGE);
      return {
        status: "refresh_failed",
        message: X_RECONNECT_REQUIRED_MESSAGE,
      };
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000,
    ).toISOString();

    const nextCredentials = {
      ...credentials,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
      expiresAt,
      scope: refreshed.scope || credentials.scope,
      updatedAt: now,
    };
    saveExternalServiceCredentials(nextCredentials);

    const connection = getExternalServiceConnection(userId, "x");
    const healthyConnection =
      connection.status === "error"
        ? {
            ...connection,
            status: "connected" as const,
            errorMessage: null,
          }
        : connection;
    if (healthyConnection !== connection) {
      saveExternalServiceConnection(userId, healthyConnection);
    }

    void persistXAuthToSupabase(nextCredentials, healthyConnection);
    schedulePersistExternalAuth(userId);

    return { status: "ready", accessToken: refreshed.access_token };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : X_RECONNECT_REQUIRED_MESSAGE;
    // Never log refresh tokens / access tokens — message only.
    console.warn("[X Account] Token refresh failed:", message);
    markXConnectionNeedsReconnect(userId, X_RECONNECT_REQUIRED_MESSAGE);
    return {
      status: "refresh_failed",
      message: X_RECONNECT_REQUIRED_MESSAGE,
    };
  }
}

/** Returns a valid access token, refreshing when expired. */
export async function getXAccountAccessToken(
  userId: string,
): Promise<string | null> {
  const result = await getXAccountAccessTokenResult(userId);
  return result.status === "ready" ? result.accessToken : null;
}
