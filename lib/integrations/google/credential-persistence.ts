import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

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
  updated_at: string;
};

export type GooglePersistedAuth = {
  credentials: ExternalServiceCredentialRecord;
  connection: ExternalServiceConnection;
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

function rowToPersisted(row: GoogleCredentialRow): GooglePersistedAuth | null {
  if (
    !row.user_id ||
    !row.access_token ||
    !row.refresh_token ||
    !row.expires_at
  ) {
    return null;
  }

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
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
      scope: row.scope ?? "",
      updatedAt: row.updated_at,
    },
    connection,
  };
}

function toRow(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
): GoogleCredentialRow {
  return {
    user_id: credentials.userId,
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
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
 * Persist Google tokens + connection metadata.
 * Returns false when Supabase is unavailable (dev may still use memory + Clerk).
 */
export async function persistGoogleAuthToSupabase(
  credentials: ExternalServiceCredentialRecord,
  connection: ExternalServiceConnection,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      console.error(
        "[Google OAuth] Production refuse token persist without SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    return false;
  }

  try {
    const { error } = await client
      .from(TABLE)
      .upsert(toRow(credentials, connection), { onConflict: "user_id" });

    if (error) {
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
