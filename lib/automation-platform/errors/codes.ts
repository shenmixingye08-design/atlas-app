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
  | "automation_usage_limit"
  | "automation_unauthorized"
  | "run_not_found"
  | "run_permission_denied"
  | "run_invalid_state"
  | "run_already_completed"
  | "run_already_cancelled"
  | "run_retry_not_allowed"
  | "run_step_retry_not_allowed"
  | "run_resume_not_allowed"
  | "run_cancel_failed"
  | "run_artifact_missing"
  | "run_notification_target_invalid"
  | "run_external_action_already_completed"
  | "run_history_load_failed"
  | "run_progress_unavailable"
  | "run_timeout";

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
  "automation_usage_limit",
  "automation_unauthorized",
  "run_not_found",
  "run_permission_denied",
  "run_invalid_state",
  "run_already_completed",
  "run_already_cancelled",
  "run_retry_not_allowed",
  "run_step_retry_not_allowed",
  "run_resume_not_allowed",
  "run_cancel_failed",
  "run_artifact_missing",
  "run_notification_target_invalid",
  "run_external_action_already_completed",
  "run_history_load_failed",
  "run_progress_unavailable",
  "run_timeout",
] as const;

export function isAutomationErrorCode(
  value: string,
): value is AutomationErrorCode {
  return (AUTOMATION_ERROR_CODES as readonly string[]).includes(value);
}
