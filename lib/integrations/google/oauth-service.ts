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
import {
  deleteGoogleAuthFromSupabase,
  persistGoogleAuthToSupabase,
} from "./credential-persistence";
import { deleteStoredDriveFolders } from "./drive/folder-store";
import {
  exchangeGoogleAccountAuthCode,
  fetchGoogleAccountUserInfo,
  revokeGoogleAccountToken,
} from "./oauth";
import {
  ensureExternalAuthHydrated,
  schedulePersistExternalAuth,
} from "../external-services/durable";
import { isAtlasProduction } from "@/lib/runtime/is-production";

async function persistGoogleAuthDurable(
  userId: string,
  connection: ExternalServiceConnection,
): Promise<void> {
  const credentials = getExternalServiceCredentials(userId, "google");
  if (credentials) {
    const ok = await persistGoogleAuthToSupabase(credentials, connection);
    if (!ok && isAtlasProduction()) {
      throw new Error(
        "Google連携の保存に失敗しました。しばらくしてから再度お試しください",
      );
    }
  } else {
    await deleteGoogleAuthFromSupabase(userId);
  }
  schedulePersistExternalAuth(userId);
}

export async function completeGoogleAccountOAuth(
  userId: string,
  code: string,
  requestOrigin: string,
): Promise<ExternalServiceConnection> {
  await ensureExternalAuthHydrated(userId);
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
    scopes: token.scope
      ? token.scope.split(/[\s,]+/).filter(Boolean)
      : [...GOOGLE_ACCOUNT_SCOPES],
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: profile.email,
      name: profile.name ?? null,
      pictureUrl: profile.picture ?? null,
    },
  };

  saveExternalServiceConnection(userId, connection);
  await persistGoogleAuthDurable(userId, connection);
  return connection;
}

export async function disconnectGoogleAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  await ensureExternalAuthHydrated(userId);
  const credentials = getExternalServiceCredentials(userId, "google");
  if (credentials) {
    try {
      await revokeGoogleAccountToken(credentials.refreshToken);
    } catch (error) {
      console.warn("[Google Account] Refresh token revoke failed");
      if (error instanceof Error && error.message) {
        // Avoid logging token material — message only.
        console.warn("[Google Account] Revoke detail:", error.message);
      }
    }
    try {
      await revokeGoogleAccountToken(credentials.accessToken);
    } catch (error) {
      console.warn("[Google Account] Access token revoke failed");
      if (error instanceof Error && error.message) {
        console.warn("[Google Account] Revoke detail:", error.message);
      }
    }
    deleteExternalServiceCredentials(userId, "google");
  }

  deleteStoredDriveFolders(userId);
  await deleteGoogleAuthFromSupabase(userId);

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
  schedulePersistExternalAuth(userId);
  return disconnected;
}

/** Mark Google connection as needing reconnect (token refresh / auth failure). */
export function markGoogleConnectionNeedsReconnect(
  userId: string,
  message: string,
): ExternalServiceConnection {
  const current = getExternalServiceConnection(userId, "google");
  const next: ExternalServiceConnection = {
    ...createDefaultConnection(googleServiceDefinition),
    status: "error",
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    scopes: current.scopes,
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: message,
    account: current.account,
  };
  saveExternalServiceConnection(userId, next);

  const credentials = getExternalServiceCredentials(userId, "google");
  if (credentials) {
    void persistGoogleAuthToSupabase(credentials, next);
  }
  schedulePersistExternalAuth(userId);
  return next;
}
