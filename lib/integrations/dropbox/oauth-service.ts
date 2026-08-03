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
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { DROPBOX_OAUTH_SCOPES } from "./config";
import { dropboxServiceDefinition } from "./definition";
import {
  deleteDropboxAuthFromSupabase,
  persistDropboxAuthToSupabase,
} from "./credential-persistence";
import {
  exchangeDropboxAuthCode,
  fetchDropboxAccount,
  refreshDropboxAccessToken,
  revokeDropboxToken,
} from "./oauth";
import {
  ensureExternalAuthHydrated,
  schedulePersistExternalAuth,
} from "../external-services/durable";

async function persistDropboxAuthDurable(
  userId: string,
  connection: ExternalServiceConnection,
  extras?: {
    lastRefreshAt?: string | null;
    revokedAt?: string | null;
  },
): Promise<void> {
  const credentials = getExternalServiceCredentials(userId, "dropbox");
  if (credentials) {
    const ok = await persistDropboxAuthToSupabase(credentials, connection, extras);
    if (!ok && isAtlasProduction()) {
      throw new Error(
        "Dropbox連携の保存に失敗しました。しばらくしてから再度お試しください",
      );
    }
  } else {
    await deleteDropboxAuthFromSupabase(userId);
  }
  schedulePersistExternalAuth(userId);
}

export async function completeDropboxAccountOAuth(
  userId: string,
  code: string,
  codeVerifier: string,
  requestOrigin: string,
): Promise<ExternalServiceConnection> {
  await ensureExternalAuthHydrated(userId);
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
    scopes: token.scope
      ? token.scope.split(/[\s,]+/).filter(Boolean)
      : [...DROPBOX_OAUTH_SCOPES],
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
  await persistDropboxAuthDurable(userId, connection);
  return connection;
}

export async function disconnectDropboxAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  await ensureExternalAuthHydrated(userId);
  const credentials = getExternalServiceCredentials(userId, "dropbox");
  if (credentials) {
    try {
      await revokeDropboxToken(credentials.accessToken);
    } catch (error) {
      console.warn("[Dropbox] Token revoke failed:", error);
    }
    deleteExternalServiceCredentials(userId, "dropbox");
    await deleteDropboxAuthFromSupabase(userId);
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
  schedulePersistExternalAuth(userId);
  return disconnected;
}

export async function getDropboxAccessToken(
  userId: string,
): Promise<string | null> {
  await ensureExternalAuthHydrated(userId);
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

    const connection = getExternalServiceConnection(userId, "dropbox");
    await persistDropboxAuthDurable(userId, connection, {
      lastRefreshAt: now,
    });

    return refreshed.access_token;
  } catch (error) {
    console.warn("[Dropbox] Token refresh failed:", error);
    return null;
  }
}
