import {
  createDefaultExecutionFlow,
  normalizeExecutionFlow,
  toggleExecutionFlowStep,
} from "@/lib/automations/execution-flow";
import type {
  Automation,
  AutomationDestination,
  AutomationExecutionLevel,
  WorkExecutionFlow,
} from "@/lib/automations/types";

export const AUTOMATION_DESTINATIONS = ["none", "x"] as const;

export function normalizeAutomationDestination(
  value: unknown,
): AutomationDestination {
  return value === "x" ? "x" : "none";
}

export function isXDestination(destination: AutomationDestination | undefined): boolean {
  return destination === "x";
}

/** Build an SNS execution flow that actually posts to X when enabled. */
export function buildXDestinationExecutionFlow(
  approvalMode: AutomationExecutionLevel,
): WorkExecutionFlow {
  let flow = createDefaultExecutionFlow("sns_post");
  // Default template disables external steps — turn publish on for real posts.
  if (approvalMode === "full_auto" || approvalMode === "approve_then_run") {
    flow = toggleExecutionFlowStep(flow, "publish", true);
    flow = toggleExecutionFlowStep(flow, "schedule_post", false);
  } else {
    // draft_save: generate copy only
    flow = toggleExecutionFlowStep(flow, "publish", false);
    flow = toggleExecutionFlowStep(flow, "schedule_post", false);
  }
  flow = toggleExecutionFlowStep(flow, "copywriting", true);
  return normalizeExecutionFlow(flow);
}

export function automationPostsToX(automation: Automation): boolean {
  if (isXDestination(automation.destination)) return true;
  const flow = normalizeExecutionFlow(automation.executionFlow);
  return (
    flow.templateId === "sns_post" &&
    flow.steps.some((step) => step.id === "publish" && step.enabled)
  );
}

/** True when this run should call the X API immediately (no approval wait). */
export function shouldAutoPublishToX(automation: Automation): boolean {
  return (
    automationPostsToX(automation) &&
    automation.executionLevel === "full_auto" &&
    automation.enabled
  );
}

/** True when generated copy should wait for user confirmation before posting. */
export function shouldAwaitXPostApproval(automation: Automation): boolean {
  return (
    automationPostsToX(automation) &&
    automation.executionLevel === "approve_then_run"
  );
}

export function approvalModeLabel(level: AutomationExecutionLevel): string {
  switch (level) {
    case "full_auto":
      return "完全自動投稿";
    case "approve_then_run":
      return "投稿前に確認";
    case "draft_save":
      return "下書きのみ作成";
    case "suggest_only":
      return "作成前に確認";
    default:
      return level;
  }
}
