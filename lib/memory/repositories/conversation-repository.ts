import type {
  Conversation,
  ConversationFilter,
  CreateConversationInput,
  PageRequest,
  PageResult,
  UpdateConversationInput,
} from "../types";

/**
 * Persistence contract for {@link Conversation} threads.
 * Supabase: `conversations` table; index on `(project_id, kind)`.
 */
export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findMany(
    filter?: ConversationFilter,
    page?: PageRequest,
  ): Promise<PageResult<Conversation>>;
  create(input: CreateConversationInput): Promise<Conversation>;
  update(input: UpdateConversationInput): Promise<Conversation>;
  delete(id: string): Promise<void>;
}
