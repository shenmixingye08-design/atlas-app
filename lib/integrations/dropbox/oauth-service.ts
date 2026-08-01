import "server-only";

import { recordOAuthLifecycleEvent } from "@/lib/integrations/production/oauth-lifecycle";

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
  if (!credentials) return;
  await persistDropboxAuthToSupabase(credentials, connection);
}

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

  const credentials = {
    userId,
    serviceId: "dropbox" as const,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    scope: token.scope ?? DROPBOX_OAUTH_SCOPES.join(" "),
    updatedAt: now,
  };
  saveExternalServiceCredentials(credentials);

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
  recordOAuthLifecycleEvent({
    integration: "dropbox",
    userId,
    phase: "callback",
    message: "Dropbox OAuth完了",
  });
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

  await deleteDropboxAuthFromSupabase(userId);

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
  recordOAuthLifecycleEvent({
    integration: "dropbox",
    userId,
    phase: "disconnect",
    message: "Dropbox接続を解除しました",
  });
  return disconnected;
}

export type DropboxAccessTokenResult =
  | { status: "ready"; accessToken: string }
  | { status: "missing"; message: string }
  | { status: "refresh_failed"; message: string };

export async function getDropboxAccessTokenResult(
  userId: string,
): Promise<DropboxAccessTokenResult> {
  const credentials = getExternalServiceCredentials(userId, "dropbox");
  if (!credentials) {
    return { status: "missing", message: "Dropboxを接続してください" };
  }

  const expiresAtMs = new Date(credentials.expiresAt).getTime();
  const bufferMs = 60_000;

  if (Date.now() < expiresAtMs - bufferMs) {
    return { status: "ready", accessToken: credentials.accessToken };
  }

  if (!credentials.refreshToken) {
    recordOAuthLifecycleEvent({
      integration: "dropbox",
      userId,
      phase: "expired",
      message: "Dropbox refresh token がありません",
    });
    return {
      status: "refresh_failed",
      message: "Dropboxの再接続が必要です",
    };
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
    const healthy: ExternalServiceConnection = {
      ...connection,
      status: "connected",
      errorMessage: null,
    };
    saveExternalServiceConnection(userId, healthy);
    void persistDropboxAuthToSupabase(nextCredentials, healthy);

    recordOAuthLifecycleEvent({
      integration: "dropbox",
      userId,
      phase: "refresh",
      message: "Dropbox access token を更新しました",
    });

    return { status: "ready", accessToken: refreshed.access_token };
  } catch (error) {
    console.warn("[Dropbox] Token refresh failed:", error);
    const failed: ExternalServiceConnection = {
      ...getExternalServiceConnection(userId, "dropbox"),
      status: "error",
      errorMessage: "Dropboxの再接続が必要です",
    };
    saveExternalServiceConnection(userId, failed);
    recordOAuthLifecycleEvent({
      integration: "dropbox",
      userId,
      phase: "expired",
      message: "Dropbox token refresh に失敗しました",
    });
    return {
      status: "refresh_failed",
      message: "Dropboxの再接続が必要です",
    };
  }
}

export async function getDropboxAccessToken(
  userId: string,
): Promise<string | null> {
  const result = await getDropboxAccessTokenResult(userId);
  return result.status === "ready" ? result.accessToken : null;
}
