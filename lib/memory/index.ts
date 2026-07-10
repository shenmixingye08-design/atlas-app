/**
 * ATLAS Memory Domain
 *
 * Canonical model for persisting project conversations, workflow runs,
 * generated artifacts, and employee audit trails.
 *
 * Types and repository interfaces only — no storage implementation yet.
 * Existing `lib/projects` localStorage layer remains unchanged.
 */

export type * from "./types";
export { MEMORY_DOMAIN_VERSION } from "./types";

export type {
  MemoryRepositories,
  UserRepository,
  MemoryProjectRepository,
  ConversationRepository,
  MessageRepository,
  WorkflowRunRepository,
  ArtifactRepository,
  VersionRepository,
  EmployeeActionRepository,
} from "./repositories";
