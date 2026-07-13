import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import type { ExternalServiceConnection } from "../external-services/types";
import { createDefaultConnection } from "../external-services/registry";
import { WordPressApiError, fetchWordPressCurrentUser } from "./api-client";
import {
  normalizeApplicationPassword,
  normalizeWordPressSiteUrl,
} from "./config";
import {
  deleteWordPressAuthFromSupabase,
  isWordPressSupabaseConfigured,
  persistWordPressAuthToSupabase,
} from "./credential-persistence";
import {
  deleteWordPressCredentials,
  getWordPressCredentials,
  saveWordPressCredentials,
} from "./credential-store";
import { wordpressServiceDefinition } from "./definition";
import {
  WP_AUTH_FAILURE_MESSAGE,
  WP_CONNECTION_ERROR_MESSAGE,
  WP_INVALID_SITE_URL_MESSAGE,
  WP_MISSING_FIELDS_MESSAGE,
} from "./errors";
import type { WordPressConnectInput, WordPressCredentialRecord } from "./types";

async function persistWordPressAuthDurable(
  credentials: WordPressCredentialRecord,
  connection: ExternalServiceConnection,
): Promise<void> {
  if (isWordPressSupabaseConfigured()) {
    const ok = await persistWordPressAuthToSupabase(credentials, connection);
    if (!ok && isAtlasProduction()) {
      throw new Error(
        "WordPress認証情報の保存に失敗しました。しばらくしてから再度お試しください",
      );
    }
  } else if (isAtlasProduction()) {
    throw new Error(
      "WordPress認証情報の保存にはSupabaseの設定が必要です",
    );
  }
}

function buildConnectedConnection(input: {
  siteUrl: string;
  username: string;
  displayName: string;
  previous?: ExternalServiceConnection | null;
}): ExternalServiceConnection {
  const now = new Date().toISOString();
  const base =
    input.previous ?? createDefaultConnection(wordpressServiceDefinition);

  return {
    ...base,
    status: "connected",
    connectedAt: base.connectedAt ?? now,
    lastUsedAt: now,
    scopes: [...wordpressServiceDefinition.plannedScopes],
    features: [...wordpressServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: {
      email: input.siteUrl,
      name: input.displayName,
      pictureUrl: null,
      username: input.username,
    },
  };
}

function validateConnectInput(input: WordPressConnectInput): {
  siteUrl: string;
  username: string;
  applicationPassword: string;
} {
  const username = input.username?.trim() ?? "";
  const applicationPassword = normalizeApplicationPassword(
    input.applicationPassword ?? "",
  );

  if (!input.siteUrl?.trim() || !username || !applicationPassword) {
    throw new Error(WP_MISSING_FIELDS_MESSAGE);
  }

  let siteUrl: string;
  try {
    siteUrl = normalizeWordPressSiteUrl(input.siteUrl);
  } catch {
    throw new Error(WP_INVALID_SITE_URL_MESSAGE);
  }

  return { siteUrl, username, applicationPassword };
}

/**
 * Connect or reconnect WordPress via Application Password.
 * Verifies against REST API before persisting. Credentials never leave the server.
 */
export async function connectWordPressAccount(
  userId: string,
  input: WordPressConnectInput,
): Promise<{ connection: ExternalServiceConnection; message: string }> {
  const validated = validateConnectInput(input);
  const previous = getExternalServiceConnection(userId, "wordpress");
  const isReconnect =
    previous.status === "connected" || previous.status === "error";

  const pending: ExternalServiceConnection = {
    ...createDefaultConnection(wordpressServiceDefinition),
    ...previous,
    status: "pending",
    errorMessage: null,
    scopes: [...wordpressServiceDefinition.plannedScopes],
    features: [...wordpressServiceDefinition.plannedFeatures],
  };
  saveExternalServiceConnection(userId, pending);

  try {
    const me = await fetchWordPressCurrentUser({
      siteUrl: validated.siteUrl,
      username: validated.username,
      applicationPassword: validated.applicationPassword,
    });

    const credentials: WordPressCredentialRecord = {
      userId,
      siteUrl: validated.siteUrl,
      username: validated.username,
      applicationPassword: validated.applicationPassword,
      updatedAt: new Date().toISOString(),
    };

    const connection = buildConnectedConnection({
      siteUrl: validated.siteUrl,
      username: validated.username,
      displayName: me.name || validated.username,
      previous,
    });

    saveWordPressCredentials(credentials);
    saveExternalServiceConnection(userId, connection);
    await persistWordPressAuthDurable(credentials, connection);

    return {
      connection,
      message: isReconnect
        ? "WordPressを再接続しました"
        : "WordPressを接続しました",
    };
  } catch (error) {
    const isAuth =
      error instanceof WordPressApiError && error.isAuthFailure;
    const message = isAuth
      ? WP_AUTH_FAILURE_MESSAGE
      : error instanceof Error
        ? error.message
        : WP_CONNECTION_ERROR_MESSAGE;

    const failed: ExternalServiceConnection = {
      ...pending,
      status: "error",
      errorMessage: message,
    };
    saveExternalServiceConnection(userId, failed);

    // Keep previous credentials on failed reconnect attempt.
    const existing = getWordPressCredentials(userId);
    if (existing) {
      void persistWordPressAuthToSupabase(existing, failed);
    }

    throw new Error(message);
  }
}

export async function disconnectWordPressAccount(
  userId: string,
): Promise<ExternalServiceConnection> {
  deleteWordPressCredentials(userId);
  await deleteWordPressAuthFromSupabase(userId);

  const disconnected: ExternalServiceConnection = {
    ...createDefaultConnection(wordpressServiceDefinition),
    status: "disconnected",
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [...wordpressServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };
  saveExternalServiceConnection(userId, disconnected);
  return disconnected;
}

export async function touchWordPressConnectionLastUsed(
  userId: string,
): Promise<void> {
  const connection = getExternalServiceConnection(userId, "wordpress");
  if (connection.status !== "connected") return;

  const credentials = getWordPressCredentials(userId);
  if (!credentials) return;

  const next: ExternalServiceConnection = {
    ...connection,
    lastUsedAt: new Date().toISOString(),
  };
  saveExternalServiceConnection(userId, next);
  void persistWordPressAuthToSupabase(credentials, next);
}

export async function markWordPressAuthFailure(
  userId: string,
  message = WP_AUTH_FAILURE_MESSAGE,
): Promise<void> {
  const connection = getExternalServiceConnection(userId, "wordpress");
  const credentials = getWordPressCredentials(userId);
  const next: ExternalServiceConnection = {
    ...connection,
    status: "error",
    errorMessage: message,
  };
  saveExternalServiceConnection(userId, next);
  if (credentials) {
    void persistWordPressAuthToSupabase(credentials, next);
  }
}

export function getWordPressAuthContext(userId: string): {
  siteUrl: string;
  username: string;
  applicationPassword: string;
} | null {
  const credentials = getWordPressCredentials(userId);
  if (!credentials?.applicationPassword) return null;
  return {
    siteUrl: credentials.siteUrl,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
  };
}
