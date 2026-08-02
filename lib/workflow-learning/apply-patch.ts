import type { AutomationV2 } from "@/lib/automation-platform/types";
import type { WorkflowLearningPatch } from "@/lib/workflow-learning/types";
import {
  assertNoSecretsInPatch,
  touchesExternalSend,
  WorkflowLearningError,
} from "@/lib/workflow-learning/security";

export function applyPatchToAutomation(
  automation: AutomationV2,
  patch: WorkflowLearningPatch,
  options?: { allowHighRiskExternal?: boolean },
): { next: AutomationV2; changedFields: string[] } {
  assertNoSecretsInPatch(patch);

  if (touchesExternalSend(patch) && !options?.allowHighRiskExternal) {
    throw new WorkflowLearningError(
      "外部送信条件の変更には追加確認が必要です",
      "high_risk",
      409,
    );
  }

  const next = structuredClone(automation);
  const changedFields: string[] = [];
  const now = new Date().toISOString();

  switch (patch.kind) {
    case "retry_policy": {
      const step = next.workflow.steps.find((s) => s.id === patch.stepId);
      if (!step) {
        throw new WorkflowLearningError("対象Stepが見つかりません", "invalid", 400);
      }
      // Forbid increasing maxAttempts alone without rationale checked by caller
      step.retryPolicy = {
        ...step.retryPolicy,
        ...patch.retryPolicy,
        maxAttempts:
          patch.retryPolicy.maxAttempts ?? step.retryPolicy.maxAttempts,
        backoffMs: patch.retryPolicy.backoffMs ?? step.retryPolicy.backoffMs,
      };
      changedFields.push(`workflow.steps.${step.id}.retryPolicy`);
      next.workflow.version += 1;
      break;
    }
    case "timeout": {
      if (patch.stepId) {
        const step = next.workflow.steps.find((s) => s.id === patch.stepId);
        if (!step) {
          throw new WorkflowLearningError("対象Stepが見つかりません", "invalid", 400);
        }
        step.timeoutMs = patch.timeoutMs;
        changedFields.push(`workflow.steps.${step.id}.timeoutMs`);
      } else {
        next.workflow.timeoutPolicy.workflowTimeoutMs = patch.timeoutMs;
        changedFields.push("workflow.timeoutPolicy.workflowTimeoutMs");
      }
      next.workflow.version += 1;
      break;
    }
    case "step_order": {
      const byId = new Map(next.workflow.steps.map((s) => [s.id, s]));
      const ordered = patch.stepIds
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      if (ordered.length !== next.workflow.steps.length) {
        throw new WorkflowLearningError("Step順が不完全です", "invalid", 400);
      }
      next.workflow.steps = ordered.map((step, index) => ({
        ...step,
        order: index + 1,
      }));
      next.workflow.version += 1;
      changedFields.push("workflow.steps.order");
      break;
    }
    case "step_enabled":
    case "disable_duplicate_step": {
      const stepId =
        patch.kind === "step_enabled" ? patch.stepId : patch.stepId;
      const enabled = patch.kind === "step_enabled" ? patch.enabled : false;
      const step = next.workflow.steps.find((s) => s.id === stepId);
      if (!step) {
        throw new WorkflowLearningError("対象Stepが見つかりません", "invalid", 400);
      }
      step.enabled = enabled;
      next.workflow.version += 1;
      changedFields.push(`workflow.steps.${step.id}.enabled`);
      break;
    }
    case "execution_policy": {
      next.executionPolicy = {
        ...next.executionPolicy,
        ...patch.executionPolicy,
        systemHighRiskOverride: true,
      };
      changedFields.push("executionPolicy");
      break;
    }
    case "notification_policy": {
      next.notificationPolicy = {
        ...next.notificationPolicy,
        ...patch.notificationPolicy,
      };
      changedFields.push("notificationPolicy");
      break;
    }
    case "schedule_shift_minutes": {
      if (next.trigger.type === "schedule" && next.trigger.schedule) {
        const schedule = { ...next.trigger.schedule };
        const total = schedule.hour * 60 + schedule.minute + patch.delayMinutes;
        const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
        schedule.hour = Math.floor(normalized / 60);
        schedule.minute = normalized % 60;
        next.trigger = {
          ...next.trigger,
          schedule,
        };
        changedFields.push("trigger.schedule");
      } else {
        next.instruction = {
          ...next.instruction,
          freeformNotes: `${next.instruction.freeformNotes}\n[改善] 実行を${patch.delayMinutes}分ずらす`.trim(),
        };
        changedFields.push("instruction.freeformNotes");
      }
      break;
    }
    case "instruction_preference_hint": {
      next.instruction = {
        ...next.instruction,
        freeformNotes: `${next.instruction.freeformNotes}\n[改善メモ] ${patch.note}`.trim(),
      };
      changedFields.push("instruction.freeformNotes");
      break;
    }
    case "add_input_check": {
      const order =
        patch.afterStepId == null
          ? 1
          : (next.workflow.steps.find((s) => s.id === patch.afterStepId)?.order ??
              0) + 1;
      const id = `input_check_${Date.now().toString(36)}`;
      next.workflow.steps.push({
        id,
        type: "await_approval",
        name: patch.name,
        order,
        inputBindings: {},
        configuration: { kind: "input_check" },
        requiresApproval: true,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 86_400_000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      });
      next.workflow.steps.sort((a, b) => a.order - b.order);
      next.workflow.steps = next.workflow.steps.map((s, i) => ({
        ...s,
        order: i + 1,
      }));
      next.workflow.version += 1;
      changedFields.push("workflow.steps.add_input_check");
      break;
    }
    default: {
      throw new WorkflowLearningError("未対応のパッチです", "invalid", 400);
    }
  }

  next.updatedAt = now;
  return { next, changedFields };
}

/** Reject patches that only increase retry count without backoff/early-fail rationale. */
export function isBlindRetryIncrease(
  beforeMax: number,
  patch: WorkflowLearningPatch,
): boolean {
  if (patch.kind !== "retry_policy") return false;
  const nextMax = patch.retryPolicy.maxAttempts;
  if (typeof nextMax !== "number") return false;
  if (nextMax <= beforeMax) return false;
  const hasBackoff =
    Array.isArray(patch.retryPolicy.backoffMs) &&
    patch.retryPolicy.backoffMs.length > 0;
  if (patch.rationale === "transient_success_backoff" && hasBackoff) return false;
  if (patch.rationale === "early_fail_reconnect_cheaper_than_blind_retry") {
    return false;
  }
  return !hasBackoff;
}
