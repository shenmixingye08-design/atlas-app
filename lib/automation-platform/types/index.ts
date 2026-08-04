export type {
  AutomationDefinitionStatus,
  AutomationRunStatus,
} from "./status";
export {
  AUTOMATION_DEFINITION_STATUSES,
  AUTOMATION_RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
} from "./status";

export type {
  AutomationTriggerType,
  ScheduleFrequency,
  AutomationScheduleSpec,
  AutomationEventTrigger,
  AutomationConditionTrigger,
  AutomationTrigger,
} from "./trigger";

export type {
  AutomationCapabilityId,
  StepRiskLevel,
  StepRetryPolicy,
  AutomationWorkflowStep,
  WorkflowFailurePolicy,
  WorkflowTimeoutPolicy,
  AutomationWorkflowDefinition,
} from "./step";

export type {
  ExecutionPolicyMode,
  ApprovalTimeoutAction,
  AutomationExecutionPolicy,
} from "./execution-policy";
export { DEFAULT_EXECUTION_POLICY } from "./execution-policy";

export type {
  NotificationChannel,
  AutomationNotificationPolicy,
} from "./notification-policy";
export { DEFAULT_NOTIFICATION_POLICY } from "./notification-policy";

export type {
  AutomationMemoryScope,
  AutomationMemoryPolicy,
  MemoryReferenceRecord,
} from "./memory-policy";
export {
  AUTOMATION_MEMORY_SCOPES,
  SENSITIVE_MEMORY_SCOPES,
  DEFAULT_MEMORY_POLICY,
} from "./memory-policy";

export type {
  StructuredOptions,
  AutomationInstruction,
  InstructionConflict,
  InstructionAssumption,
  ResolvedInstruction,
} from "./instruction";
export { DEFAULT_INSTRUCTION } from "./instruction";

export type {
  AutomationV2,
  CreateAutomationV2Input,
  UpdateAutomationV2Input,
  Timestamp,
  EntityId,
} from "./automation";

export type {
  RunActor,
  AutomationRunStatusTransition,
  RunStepStatus,
  AutomationRunStep,
  AutomationRunArtifact,
  AutomationRunAttempt,
  RunPreparation,
  RunApprovalRecord,
  MemoryUsageRecord,
  AutomationRun,
  CreateAutomationRunInput,
} from "./run";
