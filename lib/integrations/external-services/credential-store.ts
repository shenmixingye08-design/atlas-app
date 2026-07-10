import "server-only";

import type { ExternalServiceId } from "./types";

/** Server-only OAuth credentials — never returned from public APIs. */
export type ExternalServiceCredentialRecord = {
  userId: string;
  serviceId: ExternalServiceId;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  updatedAt: string;
};

type CredentialBucket = Map<string, ExternalServiceCredentialRecord>;

function credentialKey(userId: string, serviceId: ExternalServiceId): string {
  return `${userId}:${serviceId}`;
}

function getBucket(): CredentialBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasExternalServiceCredentialStore?: CredentialBucket;
  };

  if (!globalScope.__atlasExternalServiceCredentialStore) {
    globalScope.__atlasExternalServiceCredentialStore = new Map();
  }

  return globalScope.__atlasExternalServiceCredentialStore;
}

export function getExternalServiceCredentials(
  userId: string,
  serviceId: ExternalServiceId,
): ExternalServiceCredentialRecord | null {
  return getBucket().get(credentialKey(userId, serviceId)) ?? null;
}

export function saveExternalServiceCredentials(
  record: ExternalServiceCredentialRecord,
): ExternalServiceCredentialRecord {
  getBucket().set(credentialKey(record.userId, record.serviceId), record);
  return record;
}

export function deleteExternalServiceCredentials(
  userId: string,
  serviceId: ExternalServiceId,
): boolean {
  return getBucket().delete(credentialKey(userId, serviceId));
}

export function resetExternalServiceCredentialStore(): void {
  getBucket().clear();
}
