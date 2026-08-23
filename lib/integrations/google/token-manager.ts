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

import {
  DURABLE_READ_FAILED_CODE,
  DURABLE_READ_FAILED_USER_MESSAGE,
} from "@/lib/integrations/durable-credential-read";

import { reloadGoogleAuthFromDurable } from "./auth-reload";
import { persistGoogleAuthToSupabase } from "./credential-persistence";
import { refreshGoogleAccountAccessToken } from "./oauth";
import { markGoogleConnectionNeedsReconnect } from "./oauth-service";
import { GOOGLE_RECONNECT_REQUIRED_MESSAGE } from "./scopes";

export type GoogleAccessTokenResult =
  | { status: "ready"; accessToken: string }
  | { status: "missing" }
  | { status: "refresh_failed"; message: string }
  | {
      status: "unavailable";
      developerCode: typeof DURABLE_READ_FAILED_CODE;
      message: string;
    };

/** Returns a valid access token, refreshing when expired or forceRefresh. */
export async function getGoogleAccountAccessTokenResult(
  userId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<GoogleAccessTokenResult> {
  await ensureExternalAuthHydrated(userId);
  const durable = await reloadGoogleAuthFromDurable(userId);
  if (durable.status === "unavailable") {
    return {
      status: "unavailable",
      developerCode: durable.developerCode,
      message: DURABLE_READ_FAILED_USER_MESSAGE,
    };
  }
  if (durable.status === "missing") {
    return { status: "missing" };
  }
  const credentials =
    durable.status === "found"
      ? durable.value.credentials
      : getExternalServiceCredentials(userId, "google");
  if (!credentials?.refreshToken) return { status: "missing" };

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (
    !options.forceRefresh &&
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

    await persistGoogleAuthToSupabase(nextCredentials, healthyConnection);
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
