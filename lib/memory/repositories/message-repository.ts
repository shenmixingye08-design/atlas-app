import type {
  CreateMessageInput,
  Message,
  MessageFilter,
  PageRequest,
  PageResult,
} from "../types";

/**
 * Persistence contract for {@link Message} transcript rows.
 * Supabase: `messages` table; index on `(conversation_id, sequence)`.
 */
export interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  findMany(
    filter?: MessageFilter,
    page?: PageRequest,
  ): Promise<PageResult<Message>>;
  /** Append a message; implementations should enforce monotonic `sequence`. */
  append(input: CreateMessageInput): Promise<Message>;
  delete(id: string): Promise<void>;
  /** Remove all messages in a conversation (e.g. GDPR erasure). */
  deleteByConversationId(conversationId: string): Promise<void>;
}
