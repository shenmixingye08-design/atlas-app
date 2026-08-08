import "server-only";

import { randomBytes } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  applyMigrationSql,
  getMigrationEnvPresence,
} from "@/lib/supabase/apply-migration-sql";
import { isOAuthEncryptionConfigured } from "./config";
import {
  decryptOAuthSecret,
  encryptOAuthSecret,
  isEncryptedOAuthPayload,
} from "./crypto";
import { loadOAuthTokenEncryptionMigrationSql } from "./migration-sql";
import {
  decodeOAuthTokenPairFromStorage,
  encodeOAuthTokenPairForStorage,
} from "./token-codec";

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
  /** In-memory encrypt/decrypt round-trip with production key (no secrets returned). */
  encryptionSelfTestOk: boolean;
  /** Temporary canary row write/read/delete proves DB stores ciphertext only. */
  canaryPersistOk: boolean;
  /** How many sampled legacy plaintext rows were re-encrypted during this probe. */
  legacyReencrypted: number;
  appliedViaPostgres: boolean;
  appliedViaManagementApi: boolean;
  error: string | null;
  envPresence: ReturnType<typeof getMigrationEnvPresence>;
  version: ReturnType<typeof getHealthVersionPayload>;
};

const CANARY_USER_ID = "__atlas_p0_02_canary__";
const CANARY_TABLE = "atlas_dropbox_oauth_credentials";

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

function runEncryptionSelfTest(): boolean {
  if (!isOAuthEncryptionConfigured()) return false;
  try {
    const nonce = randomBytes(16).toString("hex");
    const plaintext = `p0-02-selftest-${nonce}`;
    const encrypted = encryptOAuthSecret(plaintext);
    if (!isEncryptedOAuthPayload(encrypted.ciphertext)) return false;
    if (encrypted.ciphertext.includes(plaintext)) return false;
    const roundTrip = decryptOAuthSecret(encrypted.ciphertext);
    return roundTrip === plaintext;
  } catch {
    return false;
  }
}

async function runCanaryPersist(
  client: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<boolean> {
  if (!isOAuthEncryptionConfigured()) return false;
  const nonce = randomBytes(12).toString("hex");
  try {
    const encoded = encodeOAuthTokenPairForStorage({
      accessToken: `canary-access-${nonce}`,
      refreshToken: `canary-refresh-${nonce}`,
    });
    if (
      !isEncryptedOAuthPayload(encoded.accessTokenCiphertext) ||
      !isEncryptedOAuthPayload(encoded.refreshTokenCiphertext)
    ) {
      return false;
    }

    const now = new Date().toISOString();
    const row = {
      user_id: CANARY_USER_ID,
      access_token: encoded.accessTokenCiphertext,
      refresh_token: encoded.refreshTokenCiphertext,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      scope: "p0-02-canary",
      connection_status: "disconnected",
      connected_at: null,
      last_used_at: null,
      account_email: null,
      account_name: null,
      account_picture_url: null,
      provider_user_id: null,
      error_message: null,
      encryption_key_version: encoded.keyVersion,
      updated_at: now,
    };

    const upsert = await client
      .from(CANARY_TABLE as "atlas_dropbox_oauth_credentials")
      .upsert(row as never, { onConflict: "user_id" });
    if (upsert.error) return false;

    const read = await client
      .from(CANARY_TABLE as "atlas_dropbox_oauth_credentials")
      .select("access_token, refresh_token, encryption_key_version")
      .eq("user_id", CANARY_USER_ID)
      .maybeSingle();
    if (read.error || !read.data) return false;

    const access =
      typeof (read.data as { access_token?: string }).access_token === "string"
        ? (read.data as { access_token: string }).access_token
        : "";
    const refresh =
      typeof (read.data as { refresh_token?: string }).refresh_token === "string"
        ? (read.data as { refresh_token: string }).refresh_token
        : "";

    const storedAsCiphertext =
      isEncryptedOAuthPayload(access) && isEncryptedOAuthPayload(refresh);
    // Ensure canary plaintext fragments never appear in stored columns.
    const leaked =
      access.includes(nonce) ||
      refresh.includes(nonce) ||
      access.includes("canary-access") ||
      refresh.includes("canary-refresh");

    await client
      .from(CANARY_TABLE as "atlas_dropbox_oauth_credentials")
      .delete()
      .eq("user_id", CANARY_USER_ID);

    return storedAsCiphertext && !leaked;
  } catch {
    try {
      await client
        .from(CANARY_TABLE as "atlas_dropbox_oauth_credentials")
        .delete()
        .eq("user_id", CANARY_USER_ID);
    } catch {
      // ignore cleanup failure
    }
    return false;
  }
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
  legacyReencrypted: number;
  error: string | null;
}> {
  const { data, error } = await client
    .from(table as "atlas_google_oauth_credentials")
    .select("user_id, access_token, refresh_token, encryption_key_version")
    .limit(20);

  if (error) {
    if (isMissingRelation(error.message)) {
      return {
        tableOk: false,
        encryptionColumnOk: false,
        sampled: 0,
        ciphertextRows: 0,
        plaintextLegacyRows: 0,
        legacyReencrypted: 0,
        error: "table_missing",
      };
    }
    if (isMissingColumn(error.message)) {
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
        legacyReencrypted: 0,
        error: "encryption_column_missing",
      };
    }
    return {
      tableOk: false,
      encryptionColumnOk: false,
      sampled: 0,
      ciphertextRows: 0,
      plaintextLegacyRows: 0,
      legacyReencrypted: 0,
      error: "probe_failed",
    };
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{
    user_id?: string | null;
    access_token?: string | null;
    refresh_token?: string | null;
    encryption_key_version?: number | null;
  }>;

  let ciphertextRows = 0;
  let plaintextLegacyRows = 0;
  let legacyReencrypted = 0;
  const keyReady = isOAuthEncryptionConfigured();

  for (const row of rows) {
    if (row.user_id === CANARY_USER_ID) continue;
    const access = typeof row.access_token === "string" ? row.access_token : "";
    const refresh =
      typeof row.refresh_token === "string" ? row.refresh_token : "";
    if (!access && !refresh) continue;

    if (isEncryptedOAuthPayload(access) && isEncryptedOAuthPayload(refresh)) {
      ciphertextRows += 1;
      continue;
    }

    plaintextLegacyRows += 1;

    // Best-effort lazy migration during probe (shape only logged; never tokens).
    if (
      keyReady &&
      typeof row.user_id === "string" &&
      row.user_id &&
      access &&
      refresh
    ) {
      try {
        const decoded = decodeOAuthTokenPairFromStorage({
          accessToken: access,
          refreshToken: refresh,
        });
        const encoded = encodeOAuthTokenPairForStorage({
          accessToken: decoded.accessToken,
          refreshToken: decoded.refreshToken,
        });
        const { error: upsertError } = await client
          .from(table as "atlas_google_oauth_credentials")
          .update({
            access_token: encoded.accessTokenCiphertext,
            refresh_token: encoded.refreshTokenCiphertext,
            encryption_key_version: encoded.keyVersion,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("user_id", row.user_id);
        if (!upsertError) {
          legacyReencrypted += 1;
          ciphertextRows += 1;
          plaintextLegacyRows -= 1;
        }
      } catch {
        // leave as legacy; next load path may retry
      }
    }
  }

  return {
    tableOk: true,
    encryptionColumnOk: true,
    sampled: rows.filter((r) => r.user_id !== CANARY_USER_ID).length,
    ciphertextRows,
    plaintextLegacyRows,
    legacyReencrypted,
    error: null,
  };
}

export async function probeOAuthTokenEncryptionSchema(input?: {
  apply?: boolean;
}): Promise<OAuthSchemaProbe> {
  const version = getHealthVersionPayload();
  const envPresence = getMigrationEnvPresence();
  const keyConfigured = isOAuthEncryptionConfigured();
  const versionRaw =
    process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION?.trim();
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

  const encryptionSelfTestOk = runEncryptionSelfTest();

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
      encryptionSelfTestOk,
      canaryPersistOk: false,
      legacyReencrypted: 0,
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
  const canaryPersistOk = dropbox.tableOk
    ? await runCanaryPersist(client)
    : false;

  const tokenShape = {
    sampled: google.sampled + x.sampled + dropbox.sampled,
    ciphertextRows:
      google.ciphertextRows + x.ciphertextRows + dropbox.ciphertextRows,
    plaintextLegacyRows:
      google.plaintextLegacyRows +
      x.plaintextLegacyRows +
      dropbox.plaintextLegacyRows,
  };
  const legacyReencrypted =
    google.legacyReencrypted + x.legacyReencrypted + dropbox.legacyReencrypted;

  const schemaOk =
    google.tableOk &&
    x.tableOk &&
    dropbox.tableOk &&
    google.encryptionColumnOk &&
    x.encryptionColumnOk &&
    dropbox.encryptionColumnOk;

  // Deploy gate: schema + encryption key + crypto self-test + canary persist.
  const ok =
    schemaOk &&
    keyConfigured &&
    encryptionSelfTestOk &&
    canaryPersistOk &&
    !applyError;

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
    encryptionSelfTestOk,
    canaryPersistOk,
    legacyReencrypted,
    appliedViaPostgres,
    appliedViaManagementApi,
    error:
      applyError ||
      google.error ||
      x.error ||
      dropbox.error ||
      (!keyConfigured
        ? "encryption_key_missing"
        : !encryptionSelfTestOk
          ? "encryption_self_test_failed"
          : !canaryPersistOk
            ? "canary_persist_failed"
            : null),
    envPresence,
    version,
  };
}
