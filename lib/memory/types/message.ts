import type { EmployeeId } from "@/lib/employees/types";

import type { EntityId, Timestamp } from "./common";

/** Speaker role in a conversation transcript. */
export type MessageRole = "user" | "assistant" | "system" | "employee";

/**
 * A single utterance in a conversation transcript.
 *
 * Relationship: Conversation 1──* Message
 * Optional links: WorkflowRun, Artifact (when a message references generated work)
 */
export interface Message {
  id: EntityId;
  conversationId: EntityId;
  role: MessageRole;
  content: string;
  /** Set when `role` is `employee`. */
  employeeId: EmployeeId | null;
  /** Workflow run that produced or contextualizes this message. */
  workflowRunId: EntityId | null;
  /** Artifact attached or cited in this message. */
  artifactId: EntityId | null;
  /** OpenAI Responses API thread id, when applicable. */
  responseId: string | null;
  /** Ordering key within the conversation (monotonic, gap-tolerant). */
  sequence: number;
  createdAt: Timestamp;
  metadata: Readonly<Record<string, unknown>> | null;
}

export type CreateMessageInput = {
  conversationId: EntityId;
  role: MessageRole;
  content: string;
  employeeId?: EmployeeId | null;
  workflowRunId?: EntityId | null;
  artifactId?: EntityId | null;
  responseId?: string | null;
  sequence: number;
  metadata?: Readonly<Record<string, unknown>> | null;
};

export type MessageFilter = {
  conversationId?: EntityId;
  workflowRunId?: EntityId;
  artifactId?: EntityId;
  role?: MessageRole | MessageRole[];
  ids?: EntityId[];
  afterSequence?: number;
};
