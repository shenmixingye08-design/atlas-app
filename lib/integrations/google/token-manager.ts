import "server-only";

import {
  getExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "../external-services/credential-store";

import { refreshGoogleAccountAccessToken } from "./oauth";

/** Returns a valid access token, refreshing when expired. For future Gmail/Calendar/Drive APIs. */
export async function getGoogleAccountAccessToken(
  userId: string,
): Promise<string | null> {
  const credentials = getExternalServiceCredentials(userId, "google");
  if (!credentials) return null;

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (Date.now() < expiresAtMs - bufferMs) {
    return credentials.accessToken;
  }

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

  return refreshed.access_token;
}
