import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";

import type { ExternalServiceCredentialRecord } from "../external-services/credential-store";
import type { ExternalServiceConnection } from "../external-services/types";
import { createDefaultConnection } from "../external-services/registry";
import {
  decryptGoogleSecret,
  encryptGoogleSecret,
  looksLikeGoogleEncryptedSecret,
} from "./crypto";
import { isGoogleCredentialsEncryptionConfigured } from "./config";
import { googleServiceDefinition } from "./definition";

const TABLE = "atlas_google_oauth_credentials" as const;

type GoogleCredentialRow = {
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
  error_message: string | null;
  updated_at: string;
};

export type GooglePersistedAuth = {
  credentials: ExternalServiceCredentialRecord;
  connection: ExternalServiceConnection;
  tokenType: string;
  organizationId: string | null;
  lastRefreshAt: string | null;
  revokedAt: string | null;
};

export function isGoogleOAuthSupabaseConfigured(): boolean {
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
      return decryptGoogleSecret(ciphertext);
    } catch {
      console.warn(
        `[Google OAuth] Failed to decrypt ${field} token ciphertext`,
      );
      return null;
    }
  }

  if (!legacyPlaintext?.trim()) return null;

  // Migrating legacy plaintext rows: allow read only when not looking encrypted.
  if (looksLikeGoogleEncryptedSecret(legacyPlaintext)) {
    try {
      return decryptGoogleSecret(legacyPlaintext);
    } catch {
      return null;
    }
  }

  if (isAtlasProduction() && isGoogleCredentialsEncryptionConfigured()) {
    // Production with encryption configured should not keep serving plaintext
    // indefinitely — still allow one-time hydrate so we can rewrite encrypted.
    return legacyPlaintext;
  }

  return legacyPlaintext;
}

function rowToPersisted(row: GoogleCredentialRow): GooglePersistedAuth | null {
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
    : [...googleServiceDefinition.plannedScopes];

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(googleServiceDefinition),
    status,
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    scopes,
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: row.error_message,
    account: row.account_email
      ? {
          email: row.account_email,
          name: row.account_name,
          pictureUrl: row.account_picture_url,
        }
      : undefined,
  };

  return {
    credentials: {
      userId: row.user_id,
      serviceId: "google",
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
  if (isAtlasProduction() && !isGoogleCredentialsEncryptionConfigured()) {
    throw new Error(
      "Google token encryption key is required before persisting credentials in production",
    );
  }

  const accessCipher = encryptGoogleSecret(credentials.accessToken);
  const refreshCipher = encryptGoogleSecret(credentials.refreshToken);

  return {
    user_id: credentials.userId,
    // Legacy columns keep non-secret placeholders once encryption is active.
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
    error_message: connection.errorMessage,
    updated_at: credentials.updatedAt || new Date().toISOString(),
  };
}

/** Load Google OAuth credentials + connection metadata for one user. */
export async function loadGoogleAuthFromSupabase(
  userId: string,
): Promise<GooglePersistedAuth | null> {
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
        "[Google OAuth] Supabase credential load failed:",
        error.message,
      );
      return null;
    }
    if (!data) return null;
    return rowToPersisted(data as GoogleCredentialRow);
  } catch (error) {
    console.warn("[Google OAuth] Supabase credential load skipped:", error);
    return null;
  }
}

/**
 * Persist Google tokens + connection metadata (encrypted at rest).
 * Returns false when Supabase is unavailable (dev may still use memory + Clerk).
 */
export async function persistGoogleAuthToSupabase(
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
    warnIfProductionSupabaseServiceRoleMissing("atlas_google_oauth_credentials");
    return false;
  }

  try {
    const row = toRow(credentials, connection, extras);
    const { error } = await client.from(TABLE).upsert(
      row as {
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
        error_message: string | null;
        updated_at: string;
      },
      { onConflict: "user_id" },
    );

    if (error) {
      // Backward-compatible path: if ciphertext columns are not migrated yet,
      // fall back to encrypted values in legacy columns only when encryption works.
      if (
        /access_token_ciphertext|refresh_token_ciphertext|column/i.test(
          error.message,
        )
      ) {
        const legacyRow = {
          user_id: credentials.userId,
          access_token: encryptGoogleSecret(credentials.accessToken),
          refresh_token: encryptGoogleSecret(credentials.refreshToken),
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
        const retry = await client
          .from(TABLE)
          .upsert(legacyRow, { onConflict: "user_id" });
        if (retry.error) {
          console.warn(
            "[Google OAuth] Supabase credential upsert failed:",
            retry.error.message,
          );
          return false;
        }
        return true;
      }
      console.warn(
        "[Google OAuth] Supabase credential upsert failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Google OAuth] Supabase credential upsert skipped:", error);
    return false;
  }
}

export async function deleteGoogleAuthFromSupabase(
  userId: string,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  try {
    const { error } = await client.from(TABLE).delete().eq("user_id", userId);
    if (error) {
      console.warn(
        "[Google OAuth] Supabase credential delete failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Google OAuth] Supabase credential delete skipped:", error);
    return false;
  }
}
