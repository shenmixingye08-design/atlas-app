import type {
  CreateKnowledgeInput,
  KnowledgeEntry,
  KnowledgeFilter,
} from "../types";

/**
 * Persistence contract for the Company Knowledge Base.
 * All reads/writes MUST be tenant-scoped via userId.
 */
export interface KnowledgeRepository {
  list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]>;
  findById(id: string, userId?: string): Promise<KnowledgeEntry | null>;
  create(input: CreateKnowledgeInput): Promise<KnowledgeEntry>;
  createMany(inputs: CreateKnowledgeInput[]): Promise<KnowledgeEntry[]>;
  saveAll(entries: KnowledgeEntry[], userId?: string): Promise<void>;
}
