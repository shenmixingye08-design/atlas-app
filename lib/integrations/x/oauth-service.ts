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
import {
  ensureExternalAuthHydrated,
  schedulePersistExternalAuth,
} from "../external-services/durable";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { X_OAUTH_SCOPES } from "./config";
import { parseXGrantedScopes } from "./scopes";
import {
  deleteXAuthFromSupabase,
  persistXAuthToSupabase,
} from "./credential-persistence";
import { xServiceDefinition } from "./definition";
import { X_RECONNECT_REQUIRED_MESSAGE } from "./errors";
import {
  exchangeXAuthCode,
  fetchXUserProfile,
  revokeXToken,
} from "./oauth";

async function persistXAuthDurable(
  userId: string,
  connection: ExternalServiceConnection,
): Promise<void> {
  const credentials = getExternalServiceCredentials(userId, "x");
  if (credentials) {
    const ok = await persistXAuthToSupabase(credentials, connection);
    if (!ok && isAtlasProduction()) {
      throw new Error(
        "X連携の保存に失敗しました。しばらくしてから再度お試しください",
      );
    }
  } else {
    await deleteXAuthFromSupabase(userId);
  }
  schedulePersistExternalAuth(userId);
}

export async function completeXAccountOAuth(
  userId: string,
  code: string,
  codeVerifier: string,
  requestOrigin: string,
): Promise<ExternalServiceConnection> {
  await ensureExternalAuthHydrated(userId);
  const token = await exchangeXAuthCode(code, codeVerifier, requestOrigin);

  if (!token.refresh_token) {
    throw new Error(
      "X did not return a refresh token. Disconnect the app in X settings and try again.",
    );
  }

  const profile = await fetchXUserProfile(token.access_token);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const grantedScopes = parseXGrantedScopes(token.scope ?? "");

  saveExternalServiceCredentials({
    userId,
    serviceId: "x",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    scope: token.scope ?? grantedScopes.join(" "),
    updatedAt: now,
  });

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(xServiceDefinition),
    status: "connected",
    connectedAt: now,
    lastUsedAt: null,
    scopes: grantedScopes.length > 0 ? grantedScopes : [...X_OAUTH_SCOPES],
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
  await persistXAuthDurable(userId, connection);
  return connection;
}

export async function disconnectXAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  await ensureExternalAuthHydrated(userId);
  const credentials = getExternalServiceCredentials(userId, "x");
  if (credentials) {
    try {
      await revokeXToken(credentials.accessToken);
    } catch (error) {
      console.warn("[X Account] Token revoke failed");
      if (error instanceof Error && error.message) {
        console.warn("[X Account] Revoke detail:", error.message);
      }
    }
    deleteExternalServiceCredentials(userId, "x");
  }

  await deleteXAuthFromSupabase(userId);

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
  schedulePersistExternalAuth(userId);
  return disconnected;
}

/** Mark X connection as needing reconnect (token refresh / auth failure). */
export function markXConnectionNeedsReconnect(
  userId: string,
  message: string = X_RECONNECT_REQUIRED_MESSAGE,
): ExternalServiceConnection {
  const current = getExternalServiceConnection(userId, "x");
  const next: ExternalServiceConnection = {
    ...createDefaultConnection(xServiceDefinition),
    status: "error",
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    scopes: current.scopes,
    features: [...xServiceDefinition.plannedFeatures],
    errorMessage: message,
    account: current.account,
  };
  saveExternalServiceConnection(userId, next);

  const credentials = getExternalServiceCredentials(userId, "x");
  if (credentials) {
    void persistXAuthToSupabase(credentials, next);
  }
  schedulePersistExternalAuth(userId);
  return next;
}

export async function touchXConnectionLastUsed(userId: string): Promise<void> {
  const connection = getExternalServiceConnection(userId, "x");
  if (connection.status !== "connected") return;

  const next: ExternalServiceConnection = {
    ...connection,
    lastUsedAt: new Date().toISOString(),
  };
  saveExternalServiceConnection(userId, next);

  const credentials = getExternalServiceCredentials(userId, "x");
  if (credentials) {
    void persistXAuthToSupabase(credentials, next);
  }
  schedulePersistExternalAuth(userId);
}
