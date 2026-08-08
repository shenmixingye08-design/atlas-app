import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import {
  decodeOAuthTokenPairFromStorage,
  encodeOAuthTokenPairForStorage,
  isOAuthEncryptionConfigured,
  OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE,
  safeOAuthLog,
} from "@/lib/integrations/oauth-crypto";

import type { ExternalServiceCredentialRecord } from "../external-services/credential-store";
import type { ExternalServiceConnection } from "../external-services/types";
import { createDefaultConnection } from "../external-services/registry";
import { dropboxServiceDefinition } from "./definition";

const TABLE = "atlas_dropbox_oauth_credentials" as const;

type DropboxCredentialRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  connection_status: string;
  connected_at: string | null;
  last_used_at: string | null;
  account_email: string | null;
  account_name: string | null;
  account_picture_url: string | null;
  provider_user_id: string | null;
  error_message: string | null;
  encryption_key_version: number | null;
  updated_at: string;
};

export type DropboxPersistedAuth = {
  credentials: ExternalServiceCredentialRecord;
  connection: ExternalServiceConnection;
  needsReencrypt?: boolean;
};

export function isDropboxOAuthSupabaseConfigured(): boolean {
  return createServiceRoleClientIfConfigured() !== null;
}

function isConnectionStatus(
  value: string,
): value is ExternalServiceConnection["status"] {
  return (
    value === "disconnected" ||
    value === "pending" ||
    value === "connected" ||
    value === "error"
  );
}

function rowToPersisted(row: DropboxCredentialRow): DropboxPersistedAuth | null {
  if (
    !row.user_id ||
    !row.access_token ||
    !row.refresh_token ||
    !row.expires_at
  ) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeOAuthTokenPairFromStorage({
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
    });
  } catch (error) {
    safeOAuthLog(
      "warn",
      "[Dropbox OAuth] Failed to decode stored credentials (missing key, tamper, or corrupt payload)",
      error instanceof Error ? error.message : "decode_failed",
    );
    return null;
  }

  const status = isConnectionStatus(row.connection_status)
    ? row.connection_status
    : "disconnected";

  const scopes = row.scope
    ? row.scope.split(/[\s,]+/).filter(Boolean)
    : [...dropboxServiceDefinition.plannedScopes];

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(dropboxServiceDefinition),
    status,
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    scopes,
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: row.error_message,
    account:
      row.account_email || row.provider_user_id
        ? {
            email: row.account_email ?? "",
            name: row.account_name,
            pictureUrl: row.account_picture_url,
            providerUserId: row.provider_user_id ?? undefined,
          }
        : undefined,
  };

  return {
    credentials: {
      userId: row.user_id,
      serviceId: "dropbox",
      accessToken: decoded.accessToken,
      refreshToken: decoded.refreshToken,
      expiresAt: row.expires_at,
      scope: row.scope ?? "",
      updatedAt: row.updated_at,
    },
    connection,
    needsReencrypt: decoded.needsReencrypt,
  };
}

function toRow(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
): DropboxCredentialRow {
  const encoded = encodeOAuthTokenPairForStorage({
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
  });
  return {
    user_id: credentials.userId,
    access_token: encoded.accessTokenCiphertext,
    refresh_token: encoded.refreshTokenCiphertext,
    expires_at: credentials.expiresAt,
    scope: credentials.scope ?? "",
    connection_status: connection.status,
    connected_at: connection.connectedAt,
    last_used_at: connection.lastUsedAt,
    account_email: connection.account?.email ?? null,
    account_name: connection.account?.name ?? null,
    account_picture_url: connection.account?.pictureUrl ?? null,
    provider_user_id: connection.account?.providerUserId ?? null,
    error_message: connection.errorMessage,
    encryption_key_version: encoded.keyVersion,
    updated_at: credentials.updatedAt || new Date().toISOString(),
  };
}

export async function loadDropboxAuthFromSupabase(
  userId: string,
): Promise<DropboxPersistedAuth | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  if (!isOAuthEncryptionConfigured() && isAtlasProduction()) {
    console.error(
      "[Dropbox OAuth] Production refuse credential load without ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
    );
    return null;
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[Dropbox OAuth] Supabase credential load failed:",
        error.message,
      );
      return null;
    }
    if (!data) return null;
    const persisted = rowToPersisted(data as DropboxCredentialRow);
    if (persisted?.needsReencrypt && isOAuthEncryptionConfigured()) {
      void persistDropboxAuthToSupabase(
        persisted.credentials,
        persisted.connection,
      );
    }
    return persisted;
  } catch (error) {
    safeOAuthLog(
      "warn",
      "[Dropbox OAuth] Supabase credential load skipped",
      error instanceof Error ? error.message : "load_failed",
    );
    return null;
  }
}

export async function persistDropboxAuthToSupabase(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      console.error(
        "[Dropbox OAuth] Production refuse token persist without SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    return false;
  }

  if (!isOAuthEncryptionConfigured()) {
    if (isAtlasProduction()) {
      console.error(
        "[Dropbox OAuth] Production refuse credential persist without ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
      );
      return false;
    }
  }

  try {
    const row = toRow(credentials, connection);
    if (
      !row.access_token.startsWith("enc:v") ||
      !row.refresh_token.startsWith("enc:v")
    ) {
      throw new Error("Refusing plaintext OAuth token persist");
    }

    const { error } = await client
      .from(TABLE)
      .upsert(row as never, { onConflict: "user_id" });

    if (error) {
      console.warn(
        "[Dropbox OAuth] Supabase credential upsert failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE
    ) {
      console.error("[Dropbox OAuth]", OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
      return false;
    }
    safeOAuthLog(
      "warn",
      "[Dropbox OAuth] Supabase credential upsert skipped",
      error instanceof Error ? error.message : "upsert_failed",
    );
    return false;
  }
}

export async function deleteDropboxAuthFromSupabase(
  userId: string,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  try {
    const { error } = await client.from(TABLE).delete().eq("user_id", userId);
    if (error) {
      console.warn(
        "[Dropbox OAuth] Supabase credential delete failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    safeOAuthLog(
      "warn",
      "[Dropbox OAuth] Supabase credential delete skipped",
      error instanceof Error ? error.message : "delete_failed",
    );
    return false;
  }
}
