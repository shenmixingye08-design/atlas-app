import "server-only";

import { createIntegrationFromInput } from "../domain";
import type {
  ConnectIntegrationInput,
  Integration,
  IntegrationFilter,
  IntegrationProviderId,
  UpdateIntegrationInput,
} from "../types";

import type { IntegrationRepository } from "./types";

type IntegrationBucket = Map<string, Integration>;

function getBucket(): IntegrationBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasIntegrationStore?: IntegrationBucket;
  };

  if (!globalScope.__atlasIntegrationStore) {
    globalScope.__atlasIntegrationStore = new Map();
  }

  return globalScope.__atlasIntegrationStore;
}

function matchesFilter(integration: Integration, filter?: IntegrationFilter): boolean {
  if (!filter) return true;

  if (filter.connected !== undefined && integration.connected !== filter.connected) {
    return false;
  }

  if (filter.ids && !filter.ids.includes(integration.id)) {
    return false;
  }

  if (filter.provider !== undefined) {
    const providers = Array.isArray(filter.provider)
      ? filter.provider
      : [filter.provider];
    if (!providers.includes(integration.provider)) return false;
  }

  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (!statuses.includes(integration.status)) return false;
  }

  return true;
}

/** Server-side in-memory integration store (survives warm reloads). */
export class ServerIntegrationRepository implements IntegrationRepository {
  async list(filter?: IntegrationFilter): Promise<Integration[]> {
    const items = [...getBucket().values()].filter((item) =>
      matchesFilter(item, filter),
    );

    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async findById(id: string): Promise<Integration | null> {
    return getBucket().get(id) ?? null;
  }

  async findByProvider(
    provider: IntegrationProviderId,
  ): Promise<Integration | null> {
    return (
      [...getBucket().values()].find((item) => item.provider === provider) ??
      null
    );
  }

  async create(input: ConnectIntegrationInput): Promise<Integration> {
    const integration = createIntegrationFromInput(input);
    getBucket().set(integration.id, integration);
    return integration;
  }

  async save(integration: Integration): Promise<Integration> {
    getBucket().set(integration.id, integration);
    return integration;
  }

  async update(
    id: string,
    patch: UpdateIntegrationInput,
  ): Promise<Integration | null> {
    const existing = getBucket().get(id);
    if (!existing) return null;

    const updated: Integration = {
      ...existing,
      ...patch,
      metadata: patch.metadata
        ? { ...existing.metadata, ...patch.metadata }
        : existing.metadata,
      updatedAt: new Date().toISOString(),
    };

    getBucket().set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return getBucket().delete(id);
  }
}

export const serverIntegrationRepository = new ServerIntegrationRepository();
