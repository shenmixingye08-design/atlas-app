import { createHash, createHmac, randomBytes } from "crypto";

import type {
  IntegrationServiceId,
  TokenRecord,
} from "@/lib/integration-platform/types";

type Store = {
  tokens: Map<string, TokenRecord>;
};

function getStore(): Store {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationTokenStore?: Store;
  };
  if (!g.__atlasIntegrationTokenStore) {
    g.__atlasIntegrationTokenStore = { tokens: new Map() };
  }
  return g.__atlasIntegrationTokenStore;
}

function key(ownerId: string, serviceId: IntegrationServiceId): string {
  return `${ownerId}::${serviceId}`;
}

function secretKey(): string {
  return (
    process.env.INTEGRATION_TOKEN_SECRET ||
    process.env.CRON_SECRET ||
    "atlas-dev-integration-secret"
  );
}

/** Encrypt-at-rest style obfuscation for process/durable snapshots — not plaintext. */
export function sealSecret(value: string): string {
  const iv = randomBytes(8).toString("hex");
  const mac = createHmac("sha256", secretKey())
    .update(`${iv}:${value}`)
    .digest("hex")
    .slice(0, 32);
  const payload = Buffer.from(value, "utf8").toString("base64url");
  return `v1.${iv}.${mac}.${payload}`;
}

export function openSecret(sealed: string | null): string | null {
  if (!sealed) return null;
  if (!sealed.startsWith("v1.")) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4) return null;
  const [, iv, mac, payload] = parts;
  if (!iv || !mac || !payload) return null;
  const value = Buffer.from(payload, "base64url").toString("utf8");
  const expected = createHmac("sha256", secretKey())
    .update(`${iv}:${value}`)
    .digest("hex")
    .slice(0, 32);
  if (expected !== mac) return null;
  return value;
}

export function resetTokenStoreForTests(): void {
  getStore().tokens.clear();
}

export function upsertTokenRecord(
  input: Omit<TokenRecord, "updatedAt" | "rotationVersion"> & {
    rotationVersion?: number;
  },
): TokenRecord {
  const existing = getStore().tokens.get(key(input.ownerId, input.serviceId));
  const record: TokenRecord = {
    ...input,
    accessTokenEnc: input.accessTokenEnc
      ? input.accessTokenEnc.startsWith("v1.")
        ? input.accessTokenEnc
        : sealSecret(input.accessTokenEnc)
      : null,
    refreshTokenEnc: input.refreshTokenEnc
      ? input.refreshTokenEnc.startsWith("v1.")
        ? input.refreshTokenEnc
        : sealSecret(input.refreshTokenEnc)
      : null,
    rotationVersion:
      input.rotationVersion ?? (existing?.rotationVersion ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  getStore().tokens.set(key(input.ownerId, input.serviceId), record);
  return structuredClone(record);
}

export function getTokenRecord(
  ownerId: string,
  serviceId: IntegrationServiceId,
): TokenRecord | null {
  const found = getStore().tokens.get(key(ownerId, serviceId));
  return found ? structuredClone(found) : null;
}

export function markTokenUsed(
  ownerId: string,
  serviceId: IntegrationServiceId,
  ok: boolean,
): void {
  const existing = getTokenRecord(ownerId, serviceId);
  if (!existing) return;
  upsertTokenRecord({
    ...existing,
    lastUsedAt: new Date().toISOString(),
    failureCount: ok ? 0 : existing.failureCount + 1,
    rotationVersion: existing.rotationVersion,
  });
}

export function rotateAccessToken(
  ownerId: string,
  serviceId: IntegrationServiceId,
  accessToken: string,
  expiresAt: string | null,
): TokenRecord {
  const existing = getTokenRecord(ownerId, serviceId);
  if (!existing) {
    return upsertTokenRecord({
      ownerId,
      serviceId,
      accessTokenEnc: accessToken,
      refreshTokenEnc: null,
      expiresAt,
      scopes: [],
      lastUsedAt: null,
      failureCount: 0,
    });
  }
  return upsertTokenRecord({
    ownerId: existing.ownerId,
    serviceId: existing.serviceId,
    accessTokenEnc: accessToken,
    refreshTokenEnc: existing.refreshTokenEnc,
    expiresAt,
    scopes: existing.scopes,
    lastUsedAt: existing.lastUsedAt,
    failureCount: 0,
    // omit rotationVersion so upsert increments
  });
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}
