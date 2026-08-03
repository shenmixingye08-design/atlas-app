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
  if (step.type === "google_calendar") {
    const action = String(
      step.configuration?.action ?? step.configuration?.mode ?? "create",
    ).toLowerCase();
    const attendees =
      step.configuration?.attendees ?? step.configuration?.guests;
    const hasAttendees =
      (Array.isArray(attendees) && attendees.length > 0) ||
      (typeof attendees === "string" && attendees.trim().length > 0);
    // Create without external attendees may run without pre-run approval.
    // Invite / update / cancel remain high-risk.
    if ((action === "create" || action === "") && !hasAttendees) {
      return false;
    }
    return true;
  }
  return (
    stepRequiresSystemApproval(step.type) ||
    isConfigHighRisk(step)
  );
}
