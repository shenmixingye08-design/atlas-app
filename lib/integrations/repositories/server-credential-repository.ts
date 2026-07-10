import "server-only";

import type { OAuthCredentialRecord } from "../types";

type CredentialBucket = Map<string, OAuthCredentialRecord>;

function getBucket(): CredentialBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasIntegrationCredentialStore?: CredentialBucket;
  };

  if (!globalScope.__atlasIntegrationCredentialStore) {
    globalScope.__atlasIntegrationCredentialStore = new Map();
  }

  return globalScope.__atlasIntegrationCredentialStore;
}

/** Server-side OAuth token store — never exposed via public API. */
export class ServerCredentialRepository {
  async findByIntegrationId(
    integrationId: string,
  ): Promise<OAuthCredentialRecord | null> {
    return getBucket().get(integrationId) ?? null;
  }

  async save(record: OAuthCredentialRecord): Promise<OAuthCredentialRecord> {
    getBucket().set(record.integrationId, record);
    return record;
  }

  async deleteByIntegrationId(integrationId: string): Promise<boolean> {
    return getBucket().delete(integrationId);
  }
}

export const serverCredentialRepository = new ServerCredentialRepository();
