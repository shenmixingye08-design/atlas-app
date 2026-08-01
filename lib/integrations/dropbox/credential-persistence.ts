import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

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
  updated_at: string;
};

export type DropboxPersistedAuth = {
  credentials: ExternalServiceCredentialRecord;
  connection: ExternalServiceConnection;
};

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
): DropboxCredentialRow {
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
    provider_user_id: connection.account?.providerUserId ?? null,
    error_message: connection.errorMessage,
    updated_at: credentials.updatedAt || new Date().toISOString(),
  };
}

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
    console.warn("[Dropbox OAuth] Supabase credential load skipped");
    if (error instanceof Error) {
      console.warn("[Dropbox OAuth] Load detail:", error.message);
    }
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

  try {
    const { error } = await client
      .from(TABLE)
      .upsert(toRow(credentials, connection), { onConflict: "user_id" });

    if (error) {
      console.warn(
        "[Dropbox OAuth] Supabase credential upsert failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Dropbox OAuth] Supabase credential upsert skipped");
    if (error instanceof Error) {
      console.warn("[Dropbox OAuth] Upsert detail:", error.message);
    }
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
    console.warn("[Dropbox OAuth] Supabase credential delete skipped");
    if (error instanceof Error) {
      console.warn("[Dropbox OAuth] Delete detail:", error.message);
    }
    return false;
  }
}
