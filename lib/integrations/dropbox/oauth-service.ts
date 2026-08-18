import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
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
import {
  ensureExternalAuthHydrated,
  schedulePersistExternalAuth,
} from "../external-services/durable";
import { safeOAuthLog } from "@/lib/integrations/oauth-crypto";

import { DROPBOX_OAUTH_SCOPES } from "./config";
import {
  deleteDropboxAuthFromSupabase,
  persistDropboxAuthToSupabase,
} from "./credential-persistence";
import { dropboxServiceDefinition } from "./definition";
import {
  exchangeDropboxAuthCode,
  fetchDropboxAccount,
  refreshDropboxAccessToken,
  revokeDropboxToken,
} from "./oauth";

async function persistDropboxAuthDurable(
  userId: string,
  connection: ExternalServiceConnection,
): Promise<void> {
  const credentials = getExternalServiceCredentials(userId, "dropbox");
  if (credentials) {
    const ok = await persistDropboxAuthToSupabase(credentials, connection);
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
      safeOAuthLog(
        "warn",
        "[Dropbox] Token revoke failed",
        error instanceof Error ? error.message : "revoke_failed",
      );
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
  await deleteDropboxAuthFromSupabase(userId);
  schedulePersistExternalAuth(userId);
  return disconnected;
}

const DROPBOX_RECONNECT_REQUIRED_MESSAGE =
  "Dropbox連携の有効期限が切れました。再接続してください";

export function markDropboxConnectionNeedsReconnect(
  userId: string,
  message: string = DROPBOX_RECONNECT_REQUIRED_MESSAGE,
): ExternalServiceConnection {
  const current = getExternalServiceConnection(userId, "dropbox");
  const next: ExternalServiceConnection = {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "error",
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    scopes: current.scopes,
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: message,
    account: current.account,
  };
  saveExternalServiceConnection(userId, next);
  schedulePersistExternalAuth(userId);
  return next;
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

  if (!credentials.refreshToken) {
    markDropboxConnectionNeedsReconnect(userId);
    return null;
  }

  try {
    const refreshed = await refreshDropboxAccessToken(credentials.refreshToken);
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + (refreshed.expires_in ?? 14400) * 1000,
    ).toISOString();

    const nextCredentials = {
      ...credentials,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
      expiresAt,
      scope: refreshed.scope ?? credentials.scope,
      updatedAt: now,
    };
    saveExternalServiceCredentials(nextCredentials);

    const connection = getExternalServiceConnection(userId, "dropbox");
    void persistDropboxAuthToSupabase(nextCredentials, connection);
    schedulePersistExternalAuth(userId);

    return refreshed.access_token;
  } catch (error) {
    safeOAuthLog(
      "warn",
      "[Dropbox] Token refresh failed",
      error instanceof Error ? error.message : "refresh_failed",
    );
    markDropboxConnectionNeedsReconnect(userId);
    return null;
  }
}
