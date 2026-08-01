import "server-only";

import type {
  CreateKnowledgeInput,
  KnowledgeEntry,
  KnowledgeFilter,
} from "../types";
import { knowledgeTenantKey } from "../tenant-scope";

import type { KnowledgeRepository } from "./types";

type KnowledgeBucket = Map<string, KnowledgeEntry & { userId: string }>;

function getBucket(): KnowledgeBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasKnowledgeStoreV2?: KnowledgeBucket;
    /** Legacy unscoped store — never read for tenant queries. */
    __atlasKnowledgeStore?: Map<string, KnowledgeEntry>;
  };

  if (!globalScope.__atlasKnowledgeStoreV2) {
    globalScope.__atlasKnowledgeStoreV2 = new Map();
  }

  // Drop legacy global pool so it cannot leak across tenants.
  if (globalScope.__atlasKnowledgeStore) {
    globalScope.__atlasKnowledgeStore.clear();
  }

  return globalScope.__atlasKnowledgeStoreV2;
}

function matchesFilter(
  entry: KnowledgeEntry & { userId: string },
  filter?: KnowledgeFilter
): boolean {
  if (!filter) return true;

  if (filter.userId && entry.userId !== filter.userId) return false;

  if (filter.reusable !== undefined && entry.reusable !== filter.reusable) {
    return false;
  }

  if (
    filter.sourceWorkflowId &&
    entry.sourceWorkflowId !== filter.sourceWorkflowId
  ) {
    return false;
  }

  if (filter.ids && !filter.ids.includes(entry.id)) {
    return false;
  }

  if (filter.category !== undefined) {
    const categories = Array.isArray(filter.category)
      ? filter.category
      : [filter.category];
    if (!categories.includes(entry.category)) return false;
  }

  if (filter.tags && filter.tags.length > 0) {
    const entryTags = new Set(entry.tags.map((tag) => tag.toLowerCase()));
    const hasTag = filter.tags.some((tag) => entryTags.has(tag.toLowerCase()));
    if (!hasTag) return false;
  }

  return true;
}

function createEntry(
  input: CreateKnowledgeInput & { userId: string }
): KnowledgeEntry & { userId: string } {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    title: input.title.trim(),
    category: input.category,
    tags: [...(input.tags ?? [])],
    summary: input.summary.trim(),
    sourceWorkflowId: input.sourceWorkflowId ?? null,
    reusable: input.reusable ?? true,
    confidence: Math.max(0, Math.min(100, input.confidence ?? 70)),
    createdAt: now,
    ...(input.content ? { content: input.content } : {}),
    ...(input.assignmentHint ? { assignmentHint: input.assignmentHint } : {}),
  };
}

/**
 * Tenant-scoped knowledge store.
 * list/find/create WITHOUT userId are rejected (no global pool).
 */
export class ServerKnowledgeRepository implements KnowledgeRepository {
  async list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]> {
    if (!filter?.userId) {
      // Refuse unscoped listing — prevents cross-tenant dump.
      return [];
    }
    return [...getBucket().values()]
      .filter((entry) => matchesFilter(entry, filter))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map(({ userId: _u, ...rest }) => rest);
  }

  async findById(id: string, userId?: string): Promise<KnowledgeEntry | null> {
    if (!userId) return null;
    const row = getBucket().get(knowledgeTenantKey(userId, id));
    if (!row || row.userId !== userId) return null;
    const { userId: _u, ...rest } = row;
    return rest;
  }

  async create(input: CreateKnowledgeInput): Promise<KnowledgeEntry> {
    if (!input.userId) {
      throw new Error("knowledge_userId_required");
    }
    const entry = createEntry({ ...input, userId: input.userId });
    getBucket().set(knowledgeTenantKey(entry.userId, entry.id), entry);
    const { userId: _u, ...rest } = entry;
    return rest;
  }

  async createMany(inputs: CreateKnowledgeInput[]): Promise<KnowledgeEntry[]> {
    const out: KnowledgeEntry[] = [];
    for (const input of inputs) {
      out.push(await this.create(input));
    }
    return out;
  }

  async saveAll(
    entries: Array<KnowledgeEntry & { userId?: string }>,
    userId?: string
  ): Promise<void> {
    if (!userId) {
      throw new Error("knowledge_userId_required");
    }
    const bucket = getBucket();
    for (const [key, value] of bucket) {
      if (value.userId === userId) bucket.delete(key);
    }
    for (const entry of entries) {
      const uid = entry.userId ?? userId;
      if (uid !== userId) continue;
      const row = { ...entry, userId: uid };
      bucket.set(knowledgeTenantKey(uid, entry.id), row);
    }
  }
}

export const serverKnowledgeRepository = new ServerKnowledgeRepository();

export function resetKnowledgeStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasKnowledgeStoreV2?: KnowledgeBucket;
    __atlasKnowledgeStore?: Map<string, KnowledgeEntry>;
  };
  globalScope.__atlasKnowledgeStoreV2?.clear();
  globalScope.__atlasKnowledgeStore?.clear();
}
