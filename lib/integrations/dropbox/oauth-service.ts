import "server-only";

import {
  deleteExternalServiceCredentials,
  getExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "../external-services/credential-store";
import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import type { ExternalServiceConnection } from "../external-services/types";
import { createDefaultConnection } from "../external-services/registry";

import { DROPBOX_OAUTH_SCOPES } from "./config";
import { dropboxServiceDefinition } from "./definition";
import {
  exchangeDropboxAuthCode,
  fetchDropboxAccount,
  refreshDropboxAccessToken,
  revokeDropboxToken,
} from "./oauth";

export async function completeDropboxAccountOAuth(
  userId: string,
  code: string,
  codeVerifier: string,
  requestOrigin: string,
): Promise<ExternalServiceConnection> {
  const token = await exchangeDropboxAuthCode(code, codeVerifier, requestOrigin);

  if (!token.refresh_token) {
    throw new Error(
      "Dropbox did not return a refresh token. Ensure token_access_type=offline and try again.",
    );
  }

  const profile = await fetchDropboxAccount(token.access_token);
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + (token.expires_in ?? 14400) * 1000,
  ).toISOString();

  saveExternalServiceCredentials({
    userId,
    serviceId: "dropbox",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    scope: token.scope ?? DROPBOX_OAUTH_SCOPES.join(" "),
    updatedAt: now,
  });

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "connected",
    connectedAt: now,
    lastUsedAt: null,
    scopes: [...DROPBOX_OAUTH_SCOPES],
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: profile.email,
      name: profile.name?.display_name ?? null,
      pictureUrl: profile.profile_photo_url ?? null,
      providerUserId: profile.account_id,
    },
  };

  saveExternalServiceConnection(userId, connection);
  return connection;
}

export async function disconnectDropboxAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  const credentials = getExternalServiceCredentials(userId, "dropbox");
  if (credentials) {
    try {
      await revokeDropboxToken(credentials.accessToken);
    } catch (error) {
      console.warn("[Dropbox] Token revoke failed:", error);
    }
    deleteExternalServiceCredentials(userId, "dropbox");
  }

  const disconnected: ExternalServiceConnection = {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "disconnected",
    connectedAt: null,
    lastUsedAt: getExternalServiceConnection(userId, "dropbox").lastUsedAt,
    scopes: [],
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };

  saveExternalServiceConnection(userId, disconnected);
  return disconnected;
}

export async function getDropboxAccessToken(
  userId: string,
): Promise<string | null> {
  const credentials = getExternalServiceCredentials(userId, "dropbox");
  if (!credentials) return null;

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (Date.now() < expiresAtMs - bufferMs) {
    return credentials.accessToken;
  }

  if (!credentials.refreshToken) return null;

  try {
    const refreshed = await refreshDropboxAccessToken(credentials.refreshToken);
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + (refreshed.expires_in ?? 14400) * 1000,
    ).toISOString();

    saveExternalServiceCredentials({
      ...credentials,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
      expiresAt,
      scope: refreshed.scope ?? credentials.scope,
      updatedAt: now,
    });

    return refreshed.access_token;
  } catch (error) {
    console.warn("[Dropbox] Token refresh failed:", error);
    return null;
  }
}
