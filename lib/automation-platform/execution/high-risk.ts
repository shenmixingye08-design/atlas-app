import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { stepRequiresSystemApproval } from "@/lib/automation-platform/step-registry/registry";

/** Config-driven high-risk signals: delete / share / publish / billing. */
export function isConfigHighRisk(step: AutomationWorkflowStep): boolean {
  const cfg = step.configuration ?? {};
  const action = String(cfg.action ?? cfg.operation ?? "").toLowerCase();
  if (/(delete|remove|share|publish|billing|charge|課金|削除|共有|公開)/i.test(action)) {
    return true;
  }
  if (cfg.delete === true || cfg.share === true || cfg.publish === true) return true;
  if (step.type === "dropbox" && (cfg.share === true || cfg.link === true)) return true;
  return false;
}

export function isStepHighRisk(step: AutomationWorkflowStep): boolean {
  return (
    stepRequiresSystemApproval(step.type) ||
    isConfigHighRisk(step)
  );
}
