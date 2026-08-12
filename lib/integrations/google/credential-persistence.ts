import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";
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
import { googleServiceDefinition } from "./definition";

const TABLE = "atlas_google_oauth_credentials" as const;

type GoogleCredentialRow = {
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
  encryption_key_version: number | null;
  updated_at: string;
};

export type GooglePersistedAuth = {
  /**
   * Null when ciphertext could not be decoded (key mismatch / tamper).
   * Connection then carries status=error — never silent "disconnected".
   */
  credentials: ExternalServiceCredentialRecord | null;
  connection: ExternalServiceConnection;
  /** Legacy plaintext was loaded — caller should re-persist to encrypt. */
  needsReencrypt?: boolean;
  /** True when a DB row existed but tokens could not be decrypted. */
  decodeFailed?: boolean;
};

export const GOOGLE_CREDENTIAL_DECODE_FAILED_MESSAGE =
  "Google連携の認証情報を読み取れませんでした。再接続してください";

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

function buildConnectionFromRow(
  row: GoogleCredentialRow,
  overrides?: Partial<ExternalServiceConnection>,
): ExternalServiceConnection {
  const status = isConnectionStatus(row.connection_status)
    ? row.connection_status
    : "disconnected";
  const scopes = row.scope
    ? row.scope.split(/[\s,]+/).filter(Boolean)
    : [...googleServiceDefinition.plannedScopes];

  return {
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
    ...overrides,
  };
}

function rowToPersisted(row: GoogleCredentialRow): GooglePersistedAuth | null {
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
      "[Google OAuth] Failed to decode stored credentials (missing key, tamper, or corrupt payload)",
      error instanceof Error ? error.message : "decode_failed",
    );
    // Explicit failure — never hide as plain "disconnected".
    return {
      credentials: null,
      decodeFailed: true,
      connection: buildConnectionFromRow(row, {
        status: "error",
        errorMessage: GOOGLE_CREDENTIAL_DECODE_FAILED_MESSAGE,
      }),
    };
  }

  return {
    credentials: {
      userId: row.user_id,
      serviceId: "google",
      accessToken: decoded.accessToken,
      refreshToken: decoded.refreshToken,
      expiresAt: row.expires_at,
      scope: row.scope ?? "",
      updatedAt: row.updated_at,
    },
    connection: buildConnectionFromRow(row),
    needsReencrypt: decoded.needsReencrypt,
  };
}

function toRow(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
): GoogleCredentialRow {
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
    error_message: connection.errorMessage,
    encryption_key_version: encoded.keyVersion,
    updated_at: credentials.updatedAt || new Date().toISOString(),
  };
}

/** Load Google OAuth credentials + connection metadata for one user. */
export async function loadGoogleAuthFromSupabase(
  userId: string,
): Promise<GooglePersistedAuth | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  if (!isOAuthEncryptionConfigured() && isAtlasProduction()) {
    console.error(
      "[Google OAuth] Production refuse credential load without ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
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
        "[Google OAuth] Supabase credential load failed:",
        error.message,
      );
      return null;
    }
    if (!data) return null;
    const persisted = rowToPersisted(data as GoogleCredentialRow);
    if (
      persisted?.needsReencrypt &&
      persisted.credentials &&
      isOAuthEncryptionConfigured()
    ) {
      // Lazy plaintext → ciphertext migration (idempotent).
      void persistGoogleAuthToSupabase(
        persisted.credentials,
        persisted.connection,
      );
    }
    return persisted;
  } catch (error) {
    safeOAuthLog(
      "warn",
      "[Google OAuth] Supabase credential load skipped",
      error instanceof Error ? error.message : "load_failed",
    );
    return null;
  }
}

/**
 * Persist Google tokens + connection metadata (always encrypted at rest).
 * Never falls back to plaintext. Returns false when Supabase/key unavailable.
 */
export async function persistGoogleAuthToSupabase(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    warnIfProductionSupabaseServiceRoleMissing("atlas_google_oauth_credentials");
    return false;
  }

  if (!isOAuthEncryptionConfigured()) {
    if (isAtlasProduction()) {
      console.error(
        "[Google OAuth] Production refuse credential persist without ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
      );
      return false;
    }
  }

  try {
    const row = toRow(credentials, connection);
    // Defense-in-depth: never write values that still look like raw OAuth tokens.
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
        "[Google OAuth] Supabase credential upsert failed:",
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
      console.error("[Google OAuth]", OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
      return false;
    }
    safeOAuthLog(
      "warn",
      "[Google OAuth] Supabase credential upsert skipped",
      error instanceof Error ? error.message : "upsert_failed",
    );
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
    safeOAuthLog(
      "warn",
      "[Google OAuth] Supabase credential delete skipped",
      error instanceof Error ? error.message : "delete_failed",
    );
    return false;
  }
}
