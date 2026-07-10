import "server-only";

import type {
  CreateKnowledgeInput,
  KnowledgeEntry,
  KnowledgeFilter,
} from "../types";

import type { KnowledgeRepository } from "./types";

type KnowledgeBucket = Map<string, KnowledgeEntry>;

function getBucket(): KnowledgeBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasKnowledgeStore?: KnowledgeBucket;
  };

  if (!globalScope.__atlasKnowledgeStore) {
    globalScope.__atlasKnowledgeStore = new Map();
  }

  return globalScope.__atlasKnowledgeStore;
}

function matchesFilter(entry: KnowledgeEntry, filter?: KnowledgeFilter): boolean {
  if (!filter) return true;

  if (filter.reusable !== undefined && entry.reusable !== filter.reusable) {
    return false;
  }

  if (filter.sourceWorkflowId && entry.sourceWorkflowId !== filter.sourceWorkflowId) {
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

function createEntry(input: CreateKnowledgeInput): KnowledgeEntry {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
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

/** Server-side in-memory knowledge store. */
export class ServerKnowledgeRepository implements KnowledgeRepository {
  async list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]> {
    return [...getBucket().values()]
      .filter((entry) => matchesFilter(entry, filter))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async findById(id: string): Promise<KnowledgeEntry | null> {
    return getBucket().get(id) ?? null;
  }

  async create(input: CreateKnowledgeInput): Promise<KnowledgeEntry> {
    const entry = createEntry(input);
    getBucket().set(entry.id, entry);
    return entry;
  }

  async createMany(inputs: CreateKnowledgeInput[]): Promise<KnowledgeEntry[]> {
    const entries = inputs.map(createEntry);
    const bucket = getBucket();
    for (const entry of entries) {
      bucket.set(entry.id, entry);
    }
    return entries;
  }

  async saveAll(entries: KnowledgeEntry[]): Promise<void> {
    const bucket = getBucket();
    bucket.clear();
    for (const entry of entries) {
      bucket.set(entry.id, entry);
    }
  }
}

export const serverKnowledgeRepository = new ServerKnowledgeRepository();
