import "server-only";

import { randomUUID } from "crypto";

import type { IntegrationUploadRecord } from "../types";

type UploadBucket = Map<string, IntegrationUploadRecord>;

function getBucket(): UploadBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasIntegrationUploadStore?: UploadBucket;
  };

  if (!globalScope.__atlasIntegrationUploadStore) {
    globalScope.__atlasIntegrationUploadStore = new Map();
  }

  return globalScope.__atlasIntegrationUploadStore;
}

/** Persisted upload metadata for workflow history and UI. */
export class ServerUploadRepository {
  async listByWorkflowId(workflowId: string): Promise<IntegrationUploadRecord[]> {
    return [...getBucket().values()]
      .filter((record) => record.workflowId === workflowId)
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
  }

  async listByIntegrationId(
    integrationId: string,
  ): Promise<IntegrationUploadRecord[]> {
    return [...getBucket().values()]
      .filter((record) => record.integrationId === integrationId)
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
  }

  async create(
    input: Omit<IntegrationUploadRecord, "id">,
  ): Promise<IntegrationUploadRecord> {
    const record: IntegrationUploadRecord = {
      ...input,
      id: randomUUID(),
    };
    getBucket().set(record.id, record);
    return record;
  }
}

export const serverUploadRepository = new ServerUploadRepository();
