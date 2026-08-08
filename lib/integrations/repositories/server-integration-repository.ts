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

  // P0-03: tenant isolation. Legacy rows without userId never match a user filter.
  if (filter.userId !== undefined) {
    if (!integration.userId || integration.userId !== filter.userId) return false;
  }

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

  async findByIdForUser(id: string, userId: string): Promise<Integration | null> {
    const item = getBucket().get(id) ?? null;
    if (!item || item.userId !== userId) return null;
    return item;
  }

  async findByProvider(
    provider: IntegrationProviderId,
  ): Promise<Integration | null> {
    return (
      [...getBucket().values()].find((item) => item.provider === provider) ??
      null
    );
  }

  async findByProviderForUser(
    provider: IntegrationProviderId,
    userId: string,
  ): Promise<Integration | null> {
    return (
      [...getBucket().values()].find(
        (item) => item.provider === provider && item.userId === userId,
      ) ?? null
    );
  }

  async create(input: ConnectIntegrationInput): Promise<Integration> {
    const integration = createIntegrationFromInput(input);
    getBucket().set(integration.id, integration);
    return integration;
  }

  async save(integration: Integration): Promise<Integration> {
    if (!integration.userId) {
      throw new Error("Integration.userId is required");
    }
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
      userId: existing.userId,
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

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const existing = getBucket().get(id);
    if (!existing || existing.userId !== userId) return false;
    return getBucket().delete(id);
  }
}

export const serverIntegrationRepository = new ServerIntegrationRepository();

export function resetIntegrationStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasIntegrationStore?: IntegrationBucket;
  };
  globalScope.__atlasIntegrationStore = new Map();
}
