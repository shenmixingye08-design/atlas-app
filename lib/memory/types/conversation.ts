import type { EntityId, Timestamp, UserId } from "./common";

/** Purpose of a conversation thread within a project. */
export type ConversationKind =
  | "project_main"
  | "workspace"
  | "follow_up"
  | "chat";

/**
 * A durable thread of messages scoped to a project.
 *
 * Relationship: Project 1──* Conversation
 * Relationship: User 0..1──* Conversation (owner, when applicable)
 */
export interface Conversation {
  id: EntityId;
  projectId: EntityId;
  /** User who started the thread; null for system-seeded threads. */
  userId: UserId | null;
  kind: ConversationKind;
  title: string | null;
  /** Id of the last message for fast “recent activity” queries. */
  lastMessageId: EntityId | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CreateConversationInput = {
  projectId: EntityId;
  userId?: UserId | null;
  kind: ConversationKind;
  title?: string | null;
};

export type UpdateConversationInput = Partial<
  Pick<Conversation, "title" | "lastMessageId">
> & {
  id: EntityId;
};

export type ConversationFilter = {
  projectId?: EntityId;
  userId?: UserId;
  kind?: ConversationKind | ConversationKind[];
  ids?: EntityId[];
};
