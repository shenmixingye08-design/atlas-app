/**
 * Aggregated repository contracts for the ATLAS memory domain.
 *
 * Implementations (future):
 * - `Supabase*Repository` — Postgres tables + RLS
 * - `InMemory*Repository` — tests and local dev without a DB
 *
 * A coordinating `MemoryService` will compose these repositories
 * without UI or orchestration code calling Supabase directly.
 */

import type { ArtifactRepository } from "./artifact-repository";
import type { ConversationRepository } from "./conversation-repository";
import type { EmployeeActionRepository } from "./employee-action-repository";
import type { MessageRepository } from "./message-repository";
import type { MemoryProjectRepository } from "./project-repository";
import type { UserRepository } from "./user-repository";
import type { VersionRepository } from "./version-repository";
import type { WorkflowRunRepository } from "./workflow-run-repository";

export type { UserRepository } from "./user-repository";
export type { MemoryProjectRepository } from "./project-repository";
export type { ConversationRepository } from "./conversation-repository";
export type { MessageRepository } from "./message-repository";
export type { WorkflowRunRepository } from "./workflow-run-repository";
export type { ArtifactRepository } from "./artifact-repository";
export type { VersionRepository } from "./version-repository";
export type { EmployeeActionRepository } from "./employee-action-repository";

/** Bundle injected into a future memory service layer. */
export type MemoryRepositories = {
  users: UserRepository;
  projects: MemoryProjectRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  workflowRuns: WorkflowRunRepository;
  artifacts: ArtifactRepository;
  versions: VersionRepository;
  employeeActions: EmployeeActionRepository;
};
