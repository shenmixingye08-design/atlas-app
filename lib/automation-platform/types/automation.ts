import type { AutomationExecutionPolicy } from "./execution-policy";
import type { AutomationInstruction } from "./instruction";
import type { AutomationMemoryPolicy } from "./memory-policy";
import type { AutomationNotificationPolicy } from "./notification-policy";
import type { AutomationDefinitionStatus } from "./status";
import type { AutomationTrigger } from "./trigger";
import type { AutomationWorkflowDefinition } from "./step";

export type Timestamp = string;
export type EntityId = string;

/**
 * Unified Automation definition — separated from AutomationRun.
 * Compatible concepts from V1 are mapped via migration, not mixed into this shape.
 */
export type AutomationV2 = {
  id: EntityId;
  userId: string;
  name: string;
  description: string;
  status: AutomationDefinitionStatus;
  trigger: AutomationTrigger;
  workflow: AutomationWorkflowDefinition;
  executionPolicy: AutomationExecutionPolicy;
  notificationPolicy: AutomationNotificationPolicy;
  instruction: AutomationInstruction;
  memoryPolicy: AutomationMemoryPolicy;
  /** Legacy V1 id when migrated */
  legacyAutomationId: string | null;
  /** Schema version of this record */
  schemaVersion: 2;
  lastRunAt: Timestamp | null;
  nextRunAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type CreateAutomationV2Input = {
  name: string;
  description?: string;
  status?: AutomationDefinitionStatus;
  trigger: AutomationTrigger;
  workflow: AutomationWorkflowDefinition;
  executionPolicy?: Partial<AutomationExecutionPolicy>;
  notificationPolicy?: Partial<AutomationNotificationPolicy>;
  instruction?: Partial<AutomationInstruction>;
  memoryPolicy?: Partial<AutomationMemoryPolicy>;
  /** When true, conflicting instructions are rejected instead of draft-saved */
  rejectOnConflict?: boolean;
};

export type UpdateAutomationV2Input = Partial<
  Pick<
    AutomationV2,
    | "name"
    | "description"
    | "status"
    | "trigger"
    | "workflow"
    | "executionPolicy"
    | "notificationPolicy"
    | "instruction"
    | "memoryPolicy"
    | "nextRunAt"
    | "lastRunAt"
  >
>;
