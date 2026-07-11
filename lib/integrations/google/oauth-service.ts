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
import { googleServiceDefinition } from "./definition";

import { GOOGLE_ACCOUNT_SCOPES } from "./config";
import { deleteStoredDriveFolders } from "./drive/folder-store";
import {
  exchangeGoogleAccountAuthCode,
  fetchGoogleAccountUserInfo,
  revokeGoogleAccountToken,
} from "./oauth";

export async function completeGoogleAccountOAuth(
  userId: string,
  code: string,
  requestOrigin: string,
): Promise<ExternalServiceConnection> {
  const token = await exchangeGoogleAccountAuthCode(code, requestOrigin);

  if (!token.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Disconnect the app in your Google account and try again.",
    );
  }

  const profile = await fetchGoogleAccountUserInfo(token.access_token);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

  saveExternalServiceCredentials({
    userId,
    serviceId: "google",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    scope: token.scope,
    updatedAt: now,
  });

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(googleServiceDefinition),
    status: "connected",
    connectedAt: now,
    lastUsedAt: null,
    scopes: [...GOOGLE_ACCOUNT_SCOPES],
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: profile.email,
      name: profile.name ?? null,
      pictureUrl: profile.picture ?? null,
    },
  };

  saveExternalServiceConnection(userId, connection);
  return connection;
}

export async function disconnectGoogleAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  const credentials = getExternalServiceCredentials(userId, "google");
  if (credentials) {
    try {
      await revokeGoogleAccountToken(credentials.accessToken);
    } catch (error) {
      console.warn("[Google Account] Token revoke failed:", error);
    }
    deleteExternalServiceCredentials(userId, "google");
  }

  deleteStoredDriveFolders(userId);

  const disconnected: ExternalServiceConnection = {
    ...createDefaultConnection(googleServiceDefinition),
    status: "disconnected",
    connectedAt: null,
    lastUsedAt: getExternalServiceConnection(userId, "google").lastUsedAt,
    scopes: [],
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };

  saveExternalServiceConnection(userId, disconnected);
  return disconnected;
}
