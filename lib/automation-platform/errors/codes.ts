/** Machine-readable automation platform error codes. */
export type AutomationErrorCode =
  | "automation_not_found"
  | "automation_permission_denied"
  | "automation_invalid_definition"
  | "automation_invalid_schedule"
  | "automation_conflicting_instruction"
  | "automation_integration_required"
  | "automation_memory_scope_invalid"
  | "automation_duplicate_occurrence"
  | "automation_paused"
  | "automation_disabled"
  | "automation_approval_required"
  | "automation_approval_expired"
  | "automation_run_failed"
  | "automation_migration_failed"
  | "automation_unsupported_step"
  | "automation_timeout"
  | "automation_feature_disabled"
  | "automation_invalid_transition"
  | "automation_rate_limited"
  | "automation_unauthorized";

export const AUTOMATION_ERROR_CODES: readonly AutomationErrorCode[] = [
  "automation_not_found",
  "automation_permission_denied",
  "automation_invalid_definition",
  "automation_invalid_schedule",
  "automation_conflicting_instruction",
  "automation_integration_required",
  "automation_memory_scope_invalid",
  "automation_duplicate_occurrence",
  "automation_paused",
  "automation_disabled",
  "automation_approval_required",
  "automation_approval_expired",
  "automation_run_failed",
  "automation_migration_failed",
  "automation_unsupported_step",
  "automation_timeout",
  "automation_feature_disabled",
  "automation_invalid_transition",
  "automation_rate_limited",
  "automation_unauthorized",
] as const;

export function isAutomationErrorCode(
  value: string,
): value is AutomationErrorCode {
  return (AUTOMATION_ERROR_CODES as readonly string[]).includes(value);
}
