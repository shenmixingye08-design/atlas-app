/**
 * HUMAN INTERVENTION COUNT — measurable in tests, not guessed on UI.
 */

export type InterventionReason =
  | "approval_required"
  | "exception"
  | "needs_input"
  | "none";

export function countHumanInterventions(input: {
  executionLevel: "full_auto" | "approve_then_run" | "draft_save" | "suggest_only";
  runStatus: "succeeded" | "failed" | "awaiting_approval" | "needs_input";
  exception?: boolean;
  permissionsOk?: boolean;
}): { count: number; reason: InterventionReason } {
  if (input.exception || input.runStatus === "failed") {
    return { count: 1, reason: "exception" };
  }
  if (input.runStatus === "needs_input") {
    return { count: 1, reason: "needs_input" };
  }
  if (
    input.executionLevel !== "full_auto" ||
    input.runStatus === "awaiting_approval"
  ) {
    return { count: 1, reason: "approval_required" };
  }
  if (input.permissionsOk === false) {
    return { count: 1, reason: "exception" };
  }
  return { count: 0, reason: "none" };
}

export function shouldAskUserAfterSuccess(input: {
  executionLevel: "full_auto" | "approve_then_run" | "draft_save" | "suggest_only";
  succeeded: boolean;
}): boolean {
  if (!input.succeeded) return true;
  return input.executionLevel !== "full_auto";
}
