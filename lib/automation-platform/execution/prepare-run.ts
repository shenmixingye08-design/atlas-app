/**
 * Run 準備 — 実行直前に「今回やること」を整理する（AI 呼び出しなし）。
 */

import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type {
  AutomationRunStep,
  MemoryUsageRecord,
  RunPreparation,
} from "@/lib/automation-platform/types/run";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { resolveRunApprovalRequirement } from "@/lib/automation-platform/execution/policy";
import { isConfigHighRisk, isStepHighRisk } from "@/lib/automation-platform/execution/high-risk";
import { getCapabilityFormSchema } from "@/lib/automation-platform/capability-schema";
import { classifyXPostContent } from "@/lib/automation-platform/execution/x-post-content";

export { isConfigHighRisk, isStepHighRisk };

function extractField(
  config: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function describeSchedule(automation: AutomationV2, scheduledFor: string | null): string {
  if (scheduledFor) {
    return new Date(scheduledFor).toLocaleString("ja-JP", {
      timeZone: automation.trigger.timezone || "Asia/Tokyo",
    });
  }
  if (automation.trigger.type === "manual") return "手動実行";
  return "スケジュール実行";
}

function estimateDurationLabel(steps: readonly AutomationWorkflowStep[]): string {
  const enabled = steps.filter((step) => step.enabled).length;
  if (enabled <= 2) return "約1〜3分";
  if (enabled <= 5) return "約3〜8分";
  return "約8〜15分";
}

function collectExternalEffects(steps: readonly AutomationWorkflowStep[]): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (!step.enabled) continue;
    const capability = getCapability(step.type);
    if (!capability) continue;
    if (
      capability.handlerKind === "external_integration" ||
      capability.systemRequiresApproval
    ) {
      out.push(capability.name);
    }
    const cfg = step.configuration ?? {};
    const dest = extractField(cfg, ["saveTarget", "destination", "folder", "path"]);
    if (dest) out.push(`保存: ${dest}`);
    const to = extractField(cfg, ["to", "recipient", "email"]);
    if (to) out.push(`宛先: ${to}`);
  }
  return [...new Set(out)];
}

export function buildRunStepsFromAutomation(
  automation: AutomationV2,
  approvalStepIds: readonly string[] = [],
): AutomationRunStep[] {
  const approvalSet = new Set(approvalStepIds);
  return automation.workflow.steps
    .filter((step) => step.enabled)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step) => {
      const capability = getCapability(step.type);
      const highRisk = isStepHighRisk(step) || capability?.riskLevel === "high";
      return {
        id: step.id,
        capabilityId: step.type,
        name: step.name || capability?.name || step.type,
        order: step.order,
        status: "pending" as const,
        requiresApproval:
          step.requiresApproval || approvalSet.has(step.id) || highRisk,
        highRisk,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        outputSummary: null,
      };
    });
}

export function resolveMemoryUsage(automation: AutomationV2): MemoryUsageRecord {
  const allowed = automation.memoryPolicy.enabled
    ? automation.memoryPolicy.allowedScopes.filter(
        (scope) => !automation.memoryPolicy.deniedScopes.includes(scope),
      )
    : [];
  const used = allowed.map((scope) => ({
    scope,
    key: scope,
    summary: automation.memoryPolicy.lockedOverrides[scope]
      ? "ロック設定を使用"
      : "参照のみ（更新なし）",
    source: automation.memoryPolicy.lockedOverrides[scope]
      ? ("locked_override" as const)
      : ("user_memory" as const),
  }));
  return {
    used,
    updated: [], // AI must never rewrite memory during runs
    unusedScopes: automation.memoryPolicy.deniedScopes.map(String),
  };
}

export function prepareRunSnapshot(params: {
  automation: AutomationV2;
  scheduledFor: string | null;
  memoryUsage: MemoryUsageRecord;
  isFirstRun: boolean;
  priorApprovalsCount: number;
}): RunPreparation {
  const { automation, scheduledFor, memoryUsage } = params;
  const enabledSteps = automation.workflow.steps
    .filter((step) => step.enabled)
    .slice()
    .sort((a, b) => a.order - b.order);

  const approval = resolveRunApprovalRequirement({
    policy: automation.executionPolicy,
    steps: automation.workflow.steps,
    isFirstRun: params.isFirstRun,
    priorApprovalsCount: params.priorApprovalsCount,
  });

  const plannedSteps = enabledSteps.map((step) => {
    const capability = getCapability(step.type);
    const highRisk = isStepHighRisk(step) || capability?.riskLevel === "high";
    return {
      id: step.id,
      name: step.name || capability?.name || step.type,
      capabilityId: step.type,
      highRisk,
      requiresApproval:
        approval.stepIds.includes(step.id) ||
        step.requiresApproval ||
        highRisk,
    };
  });

  const summaryLines = plannedSteps.map(
    (step, index) => `${index + 1}. ${step.name}${step.highRisk ? "（確認対象）" : ""}`,
  );

  const warnings: string[] = [];
  for (const step of enabledSteps) {
    if (step.type === "x_post") {
      const classified = classifyXPostContent({
        configuration: step.configuration,
        structuredOptions: automation.instruction.structuredOptions,
        freeformNotes: automation.instruction.freeformNotes,
        description: automation.description,
        automationName: automation.name,
      });
      if (classified.mode === "missing") {
        warnings.push(`${step.name}: 投稿する内容が確認できません`);
      }
      continue;
    }
    const schema = getCapabilityFormSchema(step.type);
    for (const field of schema.fields) {
      if (!field.required) continue;
      const value = step.configuration?.[field.key];
      if (value === undefined || value === null || value === "") {
        warnings.push(`${step.name}: 「${field.label}」が未設定です`);
      }
    }
  }

  const aiNote = [
    `「${automation.name}」を今回の手順どおり実行します。`,
    memoryUsage.used.length > 0
      ? `記憶を ${memoryUsage.used.length} 件参照します（勝手に書き換えません）。`
      : "今回は記憶を参照しません。",
    approval.requiresApproval
      ? "実行前にご確認が必要です。"
      : "承認なしで自動実行します（高リスクは除く）。",
    ...warnings.slice(0, 3),
  ].join(" ");

  return {
    summary: [...summaryLines, "", aiNote].join("\n"),
    plannedSteps,
    approvalReason: approval.requiresApproval ? approval.reason : null,
    approvalStepIds: approval.stepIds,
    externalEffects: collectExternalEffects(enabledSteps),
    estimatedDurationLabel: estimateDurationLabel(enabledSteps),
    timezone: automation.trigger.timezone || "Asia/Tokyo",
    scheduledLabel: describeSchedule(automation, scheduledFor),
    preparedAt: new Date().toISOString(),
  };
}
