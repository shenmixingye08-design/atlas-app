import type {
  CreateKnowledgeInput,
  KnowledgeEntry,
  KnowledgeFilter,
} from "../types";

/**
 * Persistence contract for the Company Knowledge Base.
 */
export interface KnowledgeRepository {
  list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]>;
  findById(id: string): Promise<KnowledgeEntry | null>;
  create(input: CreateKnowledgeInput): Promise<KnowledgeEntry>;
  createMany(inputs: CreateKnowledgeInput[]): Promise<KnowledgeEntry[]>;
  saveAll(entries: KnowledgeEntry[]): Promise<void>;
}
