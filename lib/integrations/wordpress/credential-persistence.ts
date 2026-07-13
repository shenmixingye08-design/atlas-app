import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { ExternalServiceConnection } from "../external-services/types";
import { createDefaultConnection } from "../external-services/registry";
import {
  decryptWordPressSecret,
  encryptWordPressSecret,
} from "./crypto";
import { wordpressServiceDefinition } from "./definition";
import { isWordPressEncryptionConfigured } from "./config";
import type { WordPressCredentialRecord, WordPressPersistedAuth } from "./types";

const TABLE = "atlas_wordpress_credentials" as const;

type WordPressCredentialRow = {
  user_id: string;
  site_url: string;
  username: string;
  application_password_ciphertext: string;
  connection_status: string;
  connected_at: string | null;
  last_used_at: string | null;
  site_name: string | null;
  account_name: string | null;
  error_message: string | null;
  updated_at: string;
};

export function isWordPressSupabaseConfigured(): boolean {
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

function rowToPersisted(row: WordPressCredentialRow): WordPressPersistedAuth | null {
  if (
    !row.user_id ||
    !row.site_url ||
    !row.username ||
    !row.application_password_ciphertext
  ) {
    return null;
  }

  let applicationPassword: string;
  try {
    applicationPassword = decryptWordPressSecret(
      row.application_password_ciphertext,
    );
  } catch {
    console.warn(
      "[WordPress] Failed to decrypt stored credentials (key mismatch or corrupt payload)",
    );
    return null;
  }

  const status = isConnectionStatus(row.connection_status)
    ? row.connection_status
    : "disconnected";

  const connection: ExternalServiceConnection = {
    ...createDefaultConnection(wordpressServiceDefinition),
    status,
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    scopes: [...wordpressServiceDefinition.plannedScopes],
    features: [...wordpressServiceDefinition.plannedFeatures],
    errorMessage: row.error_message,
    account: {
      email: row.site_url,
      name: row.account_name ?? row.site_name ?? row.username,
      pictureUrl: null,
      username: row.username,
    },
  };

  return {
    credentials: {
      userId: row.user_id,
      siteUrl: row.site_url,
      username: row.username,
      applicationPassword,
      updatedAt: row.updated_at,
    },
    connection,
  };
}

function toRow(
  credentials: WordPressCredentialRecord,
  connection: ExternalServiceConnection,
): WordPressCredentialRow {
  return {
    user_id: credentials.userId,
    site_url: credentials.siteUrl,
    username: credentials.username,
    application_password_ciphertext: encryptWordPressSecret(
      credentials.applicationPassword,
    ),
    connection_status: connection.status,
    connected_at: connection.connectedAt,
    last_used_at: connection.lastUsedAt,
    site_name: connection.account?.name ?? null,
    account_name: connection.account?.username ?? credentials.username,
    error_message: connection.errorMessage,
    updated_at: credentials.updatedAt || new Date().toISOString(),
  };
}

export async function loadWordPressAuthFromSupabase(
  userId: string,
): Promise<WordPressPersistedAuth | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  if (!isWordPressEncryptionConfigured() && isAtlasProduction()) {
    console.error(
      "[WordPress] Production refuse credential load without ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
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
        "[WordPress] Supabase credential load failed:",
        error.message,
      );
      return null;
    }
    if (!data) return null;
    return rowToPersisted(data as WordPressCredentialRow);
  } catch (error) {
    console.warn("[WordPress] Supabase credential load skipped");
    if (error instanceof Error) {
      console.warn("[WordPress] Load detail:", error.message);
    }
    return null;
  }
}

export async function persistWordPressAuthToSupabase(
  credentials: WordPressCredentialRecord,
  connection: ExternalServiceConnection,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      console.error(
        "[WordPress] Production refuse credential persist without SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    return false;
  }

  if (!isWordPressEncryptionConfigured()) {
    if (isAtlasProduction()) {
      console.error(
        "[WordPress] Production refuse credential persist without ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
      );
      return false;
    }
  }

  try {
    const { error } = await client
      .from(TABLE)
      .upsert(toRow(credentials, connection) as never, { onConflict: "user_id" });

    if (error) {
      console.warn(
        "[WordPress] Supabase credential upsert failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[WordPress] Supabase credential upsert skipped");
    if (error instanceof Error) {
      console.warn("[WordPress] Upsert detail:", error.message);
    }
    return false;
  }
}

export async function deleteWordPressAuthFromSupabase(
  userId: string,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  try {
    const { error } = await client.from(TABLE).delete().eq("user_id", userId);
    if (error) {
      console.warn(
        "[WordPress] Supabase credential delete failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[WordPress] Supabase credential delete skipped");
    if (error instanceof Error) {
      console.warn("[WordPress] Delete detail:", error.message);
    }
    return false;
  }
}
