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

import { persistGoogleAuthToSupabase } from "./credential-persistence";
import { refreshGoogleAccountAccessToken } from "./oauth";
import { markGoogleConnectionNeedsReconnect } from "./oauth-service";
import { GOOGLE_RECONNECT_REQUIRED_MESSAGE } from "./scopes";

export type GoogleAccessTokenResult =
  | { status: "ready"; accessToken: string }
  | { status: "missing" }
  | { status: "refresh_failed"; message: string };

/** Returns a valid access token, refreshing when expired. */
export async function getGoogleAccountAccessTokenResult(
  userId: string,
): Promise<GoogleAccessTokenResult> {
  await ensureExternalAuthHydrated(userId);
  const credentials = getExternalServiceCredentials(userId, "google");
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
    const refreshed = await refreshGoogleAccountAccessToken(
      credentials.refreshToken,
    );
    if (!refreshed.access_token) {
      markGoogleConnectionNeedsReconnect(
        userId,
        GOOGLE_RECONNECT_REQUIRED_MESSAGE,
      );
      return {
        status: "refresh_failed",
        message: GOOGLE_RECONNECT_REQUIRED_MESSAGE,
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

    const connection = getExternalServiceConnection(userId, "google");
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

    void persistGoogleAuthToSupabase(nextCredentials, healthyConnection);
    schedulePersistExternalAuth(userId);

    return { status: "ready", accessToken: refreshed.access_token };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : GOOGLE_RECONNECT_REQUIRED_MESSAGE;
    // Never log refresh tokens / access tokens — message only.
    console.warn("[Google Account] Token refresh failed:", message);
    markGoogleConnectionNeedsReconnect(
      userId,
      GOOGLE_RECONNECT_REQUIRED_MESSAGE,
    );
    return {
      status: "refresh_failed",
      message: GOOGLE_RECONNECT_REQUIRED_MESSAGE,
    };
  }
}

/** Returns a valid access token, refreshing when expired. */
export async function getGoogleAccountAccessToken(
  userId: string,
): Promise<string | null> {
  const result = await getGoogleAccountAccessTokenResult(userId);
  return result.status === "ready" ? result.accessToken : null;
}
