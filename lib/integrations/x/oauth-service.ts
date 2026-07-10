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

import { X_OAUTH_SCOPES } from "./config";
import { xServiceDefinition } from "./definition";
import {
  exchangeXAuthCode,
  fetchXUserProfile,
  refreshXAccessToken,
  revokeXToken,
} from "./oauth";

export async function completeXAccountOAuth(
  userId: string,
  code: string,
  codeVerifier: string,
  requestOrigin: string,
): Promise<ExternalServiceConnection> {
  const token = await exchangeXAuthCode(code, codeVerifier, requestOrigin);

  if (!token.refresh_token) {
    throw new Error(
      "X did not return a refresh token. Disconnect the app in X settings and try again.",
    );
  }

  const profile = await fetchXUserProfile(token.access_token);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

  saveExternalServiceCredentials({
    userId,
    serviceId: "x",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    scope: token.scope ?? X_OAUTH_SCOPES.join(" "),
    updatedAt: now,
  });

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(xServiceDefinition),
    status: "connected",
    connectedAt: now,
    lastUsedAt: null,
    scopes: [...X_OAUTH_SCOPES],
    features: [...xServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: `@${profile.username}`,
      name: profile.name ?? null,
      pictureUrl: profile.profile_image_url ?? null,
      providerUserId: profile.id,
      username: profile.username,
    },
  };

  saveExternalServiceConnection(userId, connection);
  return connection;
}

export async function disconnectXAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  const credentials = getExternalServiceCredentials(userId, "x");
  if (credentials) {
    try {
      await revokeXToken(credentials.accessToken);
    } catch (error) {
      console.warn("[X Account] Token revoke failed:", error);
    }
    deleteExternalServiceCredentials(userId, "x");
  }

  const disconnected: ExternalServiceConnection = {
    ...createDefaultConnection(xServiceDefinition),
    status: "disconnected",
    connectedAt: null,
    lastUsedAt: getExternalServiceConnection(userId, "x").lastUsedAt,
    scopes: [],
    features: [...xServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };

  saveExternalServiceConnection(userId, disconnected);
  return disconnected;
}

export async function getXAccountAccessToken(
  userId: string,
): Promise<string | null> {
  const credentials = getExternalServiceCredentials(userId, "x");
  if (!credentials) return null;

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (Date.now() < expiresAtMs - bufferMs) {
    return credentials.accessToken;
  }

  const refreshed = await refreshXAccessToken(credentials.refreshToken);
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
