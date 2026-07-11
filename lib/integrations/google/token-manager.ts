import "server-only";

import {
  getExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "../external-services/credential-store";
import {
  ensureExternalAuthHydrated,
  schedulePersistExternalAuth,
} from "../external-services/durable";

import { refreshGoogleAccountAccessToken } from "./oauth";

/** Returns a valid access token, refreshing when expired. */
export async function getGoogleAccountAccessToken(
  userId: string,
): Promise<string | null> {
  await ensureExternalAuthHydrated(userId);
  const credentials = getExternalServiceCredentials(userId, "google");
  if (!credentials) return null;

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (Date.now() < expiresAtMs - bufferMs) {
    return credentials.accessToken;
  }

  try {
    const refreshed = await refreshGoogleAccountAccessToken(
      credentials.refreshToken,
    );
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000,
    ).toISOString();

    saveExternalServiceCredentials({
      ...credentials,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
      expiresAt,
      scope: refreshed.scope || credentials.scope,
      updatedAt: now,
    });
    schedulePersistExternalAuth(userId);

    return refreshed.access_token;
  } catch (error) {
    console.warn("[Google Account] Token refresh failed:", error);
    return null;
  }
}
