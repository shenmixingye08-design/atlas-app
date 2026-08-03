import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";

import type { ExternalServiceCredentialRecord } from "../external-services/credential-store";
import type { ExternalServiceConnection } from "../external-services/types";
import { createDefaultConnection } from "../external-services/registry";
import {
  decryptDropboxSecret,
  encryptDropboxSecret,
  looksLikeDropboxEncryptedSecret,
} from "./crypto";
import { isDropboxCredentialsEncryptionConfigured } from "./config";
import { dropboxServiceDefinition } from "./definition";

const TABLE = "atlas_dropbox_oauth_credentials" as const;

type DropboxCredentialRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  access_token_ciphertext?: string | null;
  refresh_token_ciphertext?: string | null;
  expires_at: string;
  scope: string;
  token_type?: string | null;
  organization_id?: string | null;
  connection_status: string;
  connected_at: string | null;
  last_used_at: string | null;
  last_refresh_at?: string | null;
  revoked_at?: string | null;
  account_email: string | null;
  account_name: string | null;
  account_picture_url: string | null;
  account_provider_user_id?: string | null;
  error_message: string | null;
  updated_at: string;
};

export type DropboxPersistedAuth = {
  credentials: ExternalServiceCredentialRecord;
  connection: ExternalServiceConnection;
  tokenType: string;
  organizationId: string | null;
  lastRefreshAt: string | null;
  revokedAt: string | null;
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

function decodeTokenField(
  ciphertext: string | null | undefined,
  legacyPlaintext: string | null | undefined,
  field: "access" | "refresh",
): string | null {
  if (ciphertext?.trim()) {
    try {
      return decryptDropboxSecret(ciphertext);
    } catch {
      console.warn(
        `[Dropbox OAuth] Failed to decrypt ${field} token ciphertext`,
      );
      return null;
    }
  }

  if (!legacyPlaintext?.trim()) return null;

  if (looksLikeDropboxEncryptedSecret(legacyPlaintext)) {
    try {
      return decryptDropboxSecret(legacyPlaintext);
    } catch {
      return null;
    }
  }

  if (isAtlasProduction() && isDropboxCredentialsEncryptionConfigured()) {
    return legacyPlaintext;
  }

  return legacyPlaintext;
}

function rowToPersisted(row: DropboxCredentialRow): DropboxPersistedAuth | null {
  if (!row.user_id || !row.expires_at) return null;

  const accessToken = decodeTokenField(
    row.access_token_ciphertext,
    row.access_token,
    "access",
  );
  const refreshToken = decodeTokenField(
    row.refresh_token_ciphertext,
    row.refresh_token,
    "refresh",
  );
  if (!accessToken || !refreshToken) return null;

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
    account: row.account_email
      ? {
          email: row.account_email,
          name: row.account_name,
          pictureUrl: row.account_picture_url,
          providerUserId: row.account_provider_user_id ?? undefined,
        }
      : undefined,
  };

  return {
    credentials: {
      userId: row.user_id,
      serviceId: "dropbox",
      accessToken,
      refreshToken,
      expiresAt: row.expires_at,
      scope: row.scope ?? "",
      updatedAt: row.updated_at,
    },
    connection,
    tokenType: row.token_type?.trim() || "Bearer",
    organizationId: row.organization_id ?? null,
    lastRefreshAt: row.last_refresh_at ?? null,
    revokedAt: row.revoked_at ?? null,
  };
}

function toRow(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
  extras?: {
    tokenType?: string;
    organizationId?: string | null;
    lastRefreshAt?: string | null;
    revokedAt?: string | null;
  },
): Record<string, unknown> {
  if (isAtlasProduction() && !isDropboxCredentialsEncryptionConfigured()) {
    throw new Error(
      "Dropbox token encryption key is required before persisting credentials in production",
    );
  }

  const accessCipher = encryptDropboxSecret(credentials.accessToken);
  const refreshCipher = encryptDropboxSecret(credentials.refreshToken);

  return {
    user_id: credentials.userId,
    access_token: "encrypted",
    refresh_token: "encrypted",
    access_token_ciphertext: accessCipher,
    refresh_token_ciphertext: refreshCipher,
    expires_at: credentials.expiresAt,
    scope: credentials.scope ?? "",
    token_type: extras?.tokenType ?? "Bearer",
    organization_id: extras?.organizationId ?? null,
    connection_status: connection.status,
    connected_at: connection.connectedAt,
    last_used_at: connection.lastUsedAt,
    last_refresh_at: extras?.lastRefreshAt ?? null,
    revoked_at: extras?.revokedAt ?? null,
    account_email: connection.account?.email ?? null,
    account_name: connection.account?.name ?? null,
    account_picture_url: connection.account?.pictureUrl ?? null,
    account_provider_user_id: connection.account?.providerUserId ?? null,
    error_message: connection.errorMessage,
    updated_at: credentials.updatedAt || new Date().toISOString(),
  };
}

/** Load Dropbox OAuth credentials + connection metadata for one user. */
export async function loadDropboxAuthFromSupabase(
  userId: string,
): Promise<DropboxPersistedAuth | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

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
    return rowToPersisted(data as DropboxCredentialRow);
  } catch (error) {
    console.warn("[Dropbox OAuth] Supabase credential load skipped:", error);
    return null;
  }
}

/**
 * Persist Dropbox tokens + connection metadata (encrypted at rest).
 * Returns false when Supabase is unavailable (dev may still use memory + Clerk).
 */
export async function persistDropboxAuthToSupabase(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
  extras?: {
    tokenType?: string;
    organizationId?: string | null;
    lastRefreshAt?: string | null;
    revokedAt?: string | null;
  },
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    warnIfProductionSupabaseServiceRoleMissing("atlas_dropbox_oauth_credentials");
    return false;
  }

  try {
    const row = toRow(credentials, connection, extras);
    const unresolved = client as unknown as {
      from: (table: string) => {
        upsert: (
          values: Record<string, unknown>,
          options: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await unresolved.from(TABLE).upsert(row, {
      onConflict: "user_id",
    });

    if (error) {
      if (
        /access_token_ciphertext|refresh_token_ciphertext|column/i.test(
          error.message,
        )
      ) {
        const legacyRow = {
          user_id: credentials.userId,
          access_token: encryptDropboxSecret(credentials.accessToken),
          refresh_token: encryptDropboxSecret(credentials.refreshToken),
          expires_at: credentials.expiresAt,
          scope: credentials.scope ?? "",
          connection_status: connection.status,
          connected_at: connection.connectedAt,
          last_used_at: connection.lastUsedAt,
          account_email: connection.account?.email ?? null,
          account_name: connection.account?.name ?? null,
          account_picture_url: connection.account?.pictureUrl ?? null,
          error_message: connection.errorMessage,
          updated_at: credentials.updatedAt || new Date().toISOString(),
        };
        const retry = await unresolved.from(TABLE).upsert(legacyRow, {
          onConflict: "user_id",
        });
        if (retry.error) {
          console.warn(
            "[Dropbox OAuth] Supabase credential upsert failed:",
            retry.error.message,
          );
          return false;
        }
        return true;
      }
      console.warn(
        "[Dropbox OAuth] Supabase credential upsert failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Dropbox OAuth] Supabase credential upsert skipped:", error);
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
    console.warn("[Dropbox OAuth] Supabase credential delete skipped:", error);
    return false;
  }
}
