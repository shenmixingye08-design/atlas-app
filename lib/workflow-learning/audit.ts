import { newId } from "@/lib/workflow-learning/fingerprint";
import { appendAudit, listAuditForUser } from "@/lib/workflow-learning/store";
import type { WorkflowLearningAuditEntry } from "@/lib/workflow-learning/types";

export function recordWorkflowLearningAudit(input: {
  userId: string;
  action: string;
  automationId?: string | null;
  candidateId?: string | null;
  revisionId?: string | null;
  outcome: WorkflowLearningAuditEntry["outcome"];
  meta?: Record<string, string | number | boolean | null>;
}): WorkflowLearningAuditEntry {
  const entry: WorkflowLearningAuditEntry = {
    id: newId("wlaud"),
    userId: input.userId,
    action: input.action,
    automationId: input.automationId ?? null,
    candidateId: input.candidateId ?? null,
    revisionId: input.revisionId ?? null,
    outcome: input.outcome,
    meta: input.meta ?? {},
    at: new Date().toISOString(),
  };
  appendAudit(entry);
  return entry;
}

export function getWorkflowLearningAudit(userId: string): WorkflowLearningAuditEntry[] {
  return listAuditForUser(userId);
}
