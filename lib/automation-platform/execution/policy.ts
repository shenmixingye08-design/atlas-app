import {
  DEFAULT_EXECUTION_POLICY,
  type AutomationExecutionPolicy,
  type AutomationWorkflowStep,
  type ExecutionPolicyMode,
} from "@/lib/automation-platform/types";
import { stepRequiresSystemApproval } from "@/lib/automation-platform/step-registry/registry";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";

const MODES: readonly ExecutionPolicyMode[] = [
  "review_before_run",
  "run_then_notify",
  "review_selected_steps",
  "approve_first_then_auto",
  "review_high_risk_only",
];

export function normalizeExecutionPolicy(
  partial?: Partial<AutomationExecutionPolicy>,
): AutomationExecutionPolicy {
  const mode = partial?.mode ?? DEFAULT_EXECUTION_POLICY.mode;
  if (!MODES.includes(mode)) {
    throw new AutomationPlatformError("automation_invalid_definition", {
      field: "executionPolicy.mode",
      value: mode,
    });
  }

  return {
    mode,
    approvalTimeoutMs:
      partial?.approvalTimeoutMs === undefined
        ? DEFAULT_EXECUTION_POLICY.approvalTimeoutMs
        : partial.approvalTimeoutMs,
    onApprovalTimeout:
      partial?.onApprovalTimeout ?? DEFAULT_EXECUTION_POLICY.onApprovalTimeout,
    selectedStepIds: partial?.selectedStepIds ?? [],
    // Hard safety — users cannot disable system high-risk override
    systemHighRiskOverride: true,
  };
}

/**
 * Determine whether a run needs approval before starting work.
 * System high-risk rules always apply.
 */
export function resolveRunApprovalRequirement(input: {
  policy: AutomationExecutionPolicy;
  steps: readonly AutomationWorkflowStep[];
  isFirstRun: boolean;
  priorApprovalsCount: number;
}): {
  requiresApproval: boolean;
  reason: string;
  stepIds: string[];
} {
  const highRiskStepIds = input.steps
    .filter((step) => step.enabled && stepRequiresSystemApproval(step.type))
    .map((step) => step.id);

  const selected = new Set(input.policy.selectedStepIds);
  const selectedStepIds = input.steps
    .filter((step) => step.enabled && (step.requiresApproval || selected.has(step.id)))
    .map((step) => step.id);

  // System safety cannot be bypassed
  if (input.policy.systemHighRiskOverride && highRiskStepIds.length > 0) {
    if (
      input.policy.mode === "run_then_notify" ||
      input.policy.mode === "approve_first_then_auto"
    ) {
      // Still require approval for high-risk; first-then-auto only auto after first approval of high-risk
      if (
        input.policy.mode === "approve_first_then_auto" &&
        input.priorApprovalsCount > 0
      ) {
        // High-risk still requires approval every time for publish/delete/send
        return {
          requiresApproval: true,
          reason: "system_high_risk_override",
          stepIds: highRiskStepIds,
        };
      }
      return {
        requiresApproval: true,
        reason: "system_high_risk_override",
        stepIds: highRiskStepIds,
      };
    }
  }

  switch (input.policy.mode) {
    case "review_before_run":
      return {
        requiresApproval: true,
        reason: "review_before_run",
        stepIds: input.steps.filter((s) => s.enabled).map((s) => s.id),
      };
    case "run_then_notify":
      return { requiresApproval: false, reason: "run_then_notify", stepIds: [] };
    case "review_selected_steps":
      return {
        requiresApproval: selectedStepIds.length > 0 || highRiskStepIds.length > 0,
        reason: "review_selected_steps",
        stepIds: [...new Set([...selectedStepIds, ...highRiskStepIds])],
      };
    case "approve_first_then_auto":
      if (input.isFirstRun || input.priorApprovalsCount === 0) {
        return {
          requiresApproval: true,
          reason: "approve_first_then_auto",
          stepIds: input.steps.filter((s) => s.enabled).map((s) => s.id),
        };
      }
      if (highRiskStepIds.length > 0) {
        return {
          requiresApproval: true,
          reason: "system_high_risk_override",
          stepIds: highRiskStepIds,
        };
      }
      return {
        requiresApproval: false,
        reason: "approve_first_then_auto_subsequent",
        stepIds: [],
      };
    case "review_high_risk_only":
      return {
        requiresApproval: highRiskStepIds.length > 0,
        reason: "review_high_risk_only",
        stepIds: highRiskStepIds,
      };
    default:
      return {
        requiresApproval: true,
        reason: "default_safe",
        stepIds: [],
      };
  }
}

export function isApprovalExpired(
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= now.getTime();
}

export function resolveApprovalTimeoutAction(
  policy: AutomationExecutionPolicy,
): AutomationExecutionPolicy["onApprovalTimeout"] {
  // Never auto-run high-risk on timeout even if configured as "run"
  // Callers must pass step risk; here we only return configured action.
  return policy.onApprovalTimeout;
}
