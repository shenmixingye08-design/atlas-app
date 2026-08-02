import type { AutomationV2 } from "@/lib/automation-platform/types";
import { newId } from "@/lib/workflow-learning/fingerprint";
import {
  findRevision,
  insertRevision,
  listRevisions,
} from "@/lib/workflow-learning/store";
import type { AutomationRevision } from "@/lib/workflow-learning/types";
import { WorkflowLearningError } from "@/lib/workflow-learning/security";

export function ensureBaselineRevision(
  automation: AutomationV2,
  createdBy: string,
): AutomationRevision {
  const existing = listRevisions(automation.id);
  if (existing.length > 0) {
    return existing[existing.length - 1]!.revisionNumber === 1
      ? existing.sort((a, b) => a.revisionNumber - b.revisionNumber)[0]!
      : existing.sort((a, b) => a.revisionNumber - b.revisionNumber)[0]!;
  }
  const baseline: AutomationRevision = {
    id: newId("arev"),
    userId: automation.userId,
    automationId: automation.id,
    revisionNumber: 1,
    parentRevisionId: null,
    changeReason: "初期状態",
    changeSource: "baseline",
    appliedCandidateIds: [],
    changedFields: [],
    snapshot: structuredClone(automation),
    createdAt: new Date().toISOString(),
    createdBy,
    rollbackTarget: null,
  };
  return insertRevision(baseline);
}

export function createRevisionFromAutomation(input: {
  automation: AutomationV2;
  parent: AutomationRevision;
  changeReason: string;
  changeSource: AutomationRevision["changeSource"];
  appliedCandidateIds: string[];
  changedFields: string[];
  createdBy: string;
  rollbackTarget: string | null;
}): AutomationRevision {
  const revision: AutomationRevision = {
    id: newId("arev"),
    userId: input.automation.userId,
    automationId: input.automation.id,
    revisionNumber: input.parent.revisionNumber + 1,
    parentRevisionId: input.parent.id,
    changeReason: input.changeReason,
    changeSource: input.changeSource,
    appliedCandidateIds: input.appliedCandidateIds,
    changedFields: input.changedFields,
    snapshot: structuredClone(input.automation),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    rollbackTarget: input.rollbackTarget,
  };
  return insertRevision(revision);
}

export function getLatestRevision(automationId: string): AutomationRevision | null {
  const list = listRevisions(automationId);
  if (list.length === 0) return null;
  return list.sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null;
}

export function requireRevision(
  automationId: string,
  revisionId: string,
  userId: string,
): AutomationRevision {
  const rev = findRevision(automationId, revisionId);
  if (!rev || rev.userId !== userId) {
    throw new WorkflowLearningError("revision_not_found", "not_found", 404);
  }
  return rev;
}

/** Revisions are never deleted — this only returns a snapshot to restore. */
export function resolveRollbackSnapshot(
  automationId: string,
  userId: string,
  targetRevisionId: string,
): AutomationRevision {
  return requireRevision(automationId, targetRevisionId, userId);
}
