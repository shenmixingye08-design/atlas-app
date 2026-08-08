import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  applyMigrationSql,
  getMigrationEnvPresence,
} from "@/lib/supabase/apply-migration-sql";
import { isOAuthEncryptionConfigured } from "./config";
import { isEncryptedOAuthPayload } from "./crypto";
import { loadOAuthTokenEncryptionMigrationSql } from "./migration-sql";

export type OAuthSchemaProbe = {
  ok: boolean;
  googleTableOk: boolean;
  xTableOk: boolean;
  dropboxTableOk: boolean;
  googleEncryptionColumnOk: boolean;
  xEncryptionColumnOk: boolean;
  dropboxEncryptionColumnOk: boolean;
  /** Rows sampled for ciphertext shape (never includes token values). */
  tokenShape: {
    sampled: number;
    ciphertextRows: number;
    plaintextLegacyRows: number;
  };
  encryptionKeyConfigured: boolean;
  encryptionKeyVersionConfigured: boolean;
  encryptionKeyVersion: number | null;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
};

function isMissingRelation(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

function isMissingColumn(message: string | undefined): boolean {
  return Boolean(
    message && /column .* does not exist|Could not find the/i.test(message),
  );
}

async function probeTable(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
  table: string,
): Promise<{
  tableOk: boolean;
  encryptionColumnOk: boolean;
  sampled: number;
  ciphertextRows: number;
  plaintextLegacyRows: number;
  error: string | null;
}> {
  const { data, error } = await client
    .from(table as "atlas_google_oauth_credentials")
    .select("access_token, refresh_token, encryption_key_version")
    .limit(20);

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        tableOk: false,
        encryptionColumnOk: false,
        sampled: 0,
        ciphertextRows: 0,
        plaintextLegacyRows: 0,
        error: "table_missing",
      };
    }
    if (isMissingColumn(error.message)) {
      // Table exists but encryption_key_version (or tokens) missing from schema cache.
      const fallback = await client
        .from(table as "atlas_google_oauth_credentials")
        .select("user_id")
        .limit(1);
      return {
        tableOk: !fallback.error,
        encryptionColumnOk: false,
        sampled: 0,
        ciphertextRows: 0,
        plaintextLegacyRows: 0,
        error: "encryption_column_missing",
      };
    }
    return {
      tableOk: false,
      encryptionColumnOk: false,
      sampled: 0,
      ciphertextRows: 0,
      plaintextLegacyRows: 0,
      error: "probe_failed",
    };
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{
    access_token?: string | null;
    refresh_token?: string | null;
    encryption_key_version?: number | null;
  }>;
  let ciphertextRows = 0;
  let plaintextLegacyRows = 0;
  for (const row of rows) {
    const access = typeof row.access_token === "string" ? row.access_token : "";
    const refresh =
      typeof row.refresh_token === "string" ? row.refresh_token : "";
    if (!access && !refresh) continue;
    if (isEncryptedOAuthPayload(access) && isEncryptedOAuthPayload(refresh)) {
      ciphertextRows += 1;
    } else {
      plaintextLegacyRows += 1;
    }
  }

  return {
    tableOk: true,
    encryptionColumnOk: true,
    sampled: rows.length,
    ciphertextRows,
    plaintextLegacyRows,
    error: null,
  };
}

export async function probeOAuthTokenEncryptionSchema(input?: {
  apply?: boolean;
}): Promise<OAuthSchemaProbe> {
  const version = getHealthVersionPayload();
  const envPresence = getMigrationEnvPresence();
  const keyConfigured = isOAuthEncryptionConfigured();
  const versionRaw = process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION?.trim();
  const encryptionKeyVersionConfigured = Boolean(versionRaw);
  const encryptionKeyVersion = versionRaw
    ? Number.parseInt(versionRaw, 10)
    : keyConfigured
      ? 1
      : null;

  let appliedViaPostgres = false;
  let appliedViaManagementApi = false;
  let applyError: string | null = null;

  if (input?.apply) {
    const sql = loadOAuthTokenEncryptionMigrationSql();
    const applied = await applyMigrationSql({
      sql,
      migrationName: "20260808_p0_02_oauth_token_encryption",
    });
    appliedViaPostgres = applied.appliedViaPostgres;
    appliedViaManagementApi = applied.appliedViaManagementApi;
    applyError = applied.error;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      googleTableOk: false,
      xTableOk: false,
      dropboxTableOk: false,
      googleEncryptionColumnOk: false,
      xEncryptionColumnOk: false,
      dropboxEncryptionColumnOk: false,
      tokenShape: { sampled: 0, ciphertextRows: 0, plaintextLegacyRows: 0 },
      encryptionKeyConfigured: keyConfigured,
      encryptionKeyVersionConfigured,
      encryptionKeyVersion,
      appliedViaPostgres,
      appliedViaManagementApi,
      error: applyError ?? "supabase_service_role_missing",
      envPresence,
      version,
    };
  }

  const google = await probeTable(client, "atlas_google_oauth_credentials");
  const x = await probeTable(client, "atlas_x_oauth_credentials");
  const dropbox = await probeTable(client, "atlas_dropbox_oauth_credentials");

  const tokenShape = {
    sampled: google.sampled + x.sampled + dropbox.sampled,
    ciphertextRows:
      google.ciphertextRows + x.ciphertextRows + dropbox.ciphertextRows,
    plaintextLegacyRows:
      google.plaintextLegacyRows +
      x.plaintextLegacyRows +
      dropbox.plaintextLegacyRows,
  };

  const schemaOk =
    google.tableOk &&
    x.tableOk &&
    dropbox.tableOk &&
    google.encryptionColumnOk &&
    x.encryptionColumnOk &&
    dropbox.encryptionColumnOk;

  // Deploy gate: schema + encryption key must both be ready in production.
  const ok = schemaOk && keyConfigured && !applyError;

  return {
    ok,
    googleTableOk: google.tableOk,
    xTableOk: x.tableOk,
    dropboxTableOk: dropbox.tableOk,
    googleEncryptionColumnOk: google.encryptionColumnOk,
    xEncryptionColumnOk: x.encryptionColumnOk,
    dropboxEncryptionColumnOk: dropbox.encryptionColumnOk,
    tokenShape,
    encryptionKeyConfigured: keyConfigured,
    encryptionKeyVersionConfigured,
    encryptionKeyVersion: Number.isFinite(encryptionKeyVersion)
      ? encryptionKeyVersion
      : null,
    appliedViaPostgres,
    appliedViaManagementApi,
    error:
      applyError ||
      google.error ||
      x.error ||
      dropbox.error ||
      (!keyConfigured ? "encryption_key_missing" : null),
    envPresence,
    version,
  };
}
