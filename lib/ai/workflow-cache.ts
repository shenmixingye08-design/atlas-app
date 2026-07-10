import "server-only";

import { createHash } from "crypto";

import { ATLAS_POLICY_VERSION, ATLAS_WORKFLOW_VERSION } from "@/lib/ai/versions";
import type { Deliverable } from "@/lib/orchestration/deliverable-types";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import { deliverableTypesMatch } from "@/lib/orchestration/deliverable-classification";
import type { ResearchReport } from "@/lib/orchestration/types";

export type WorkflowCacheKeyInput = {
  /** Exact user request — primary isolation boundary. */
  assignment: string;
  companyTemplateId?: string | null;
  companyId?: string;
  deliverableType: DeliverableType;
  workflowVersion?: string;
  policyVersion?: string;
};

export type WorkflowCacheKeyMeta = {
  key: string;
  assignmentHash: string;
  deliverableType: DeliverableType;
  companyTemplateId: string;
  companyId: string;
  workflowVersion: string;
  policyVersion: string;
};

export type CachedPlannerResult = {
  planText: string;
  tasksJson: string;
  outputText: string;
  deliverableType?: string;
};

export type WorkflowCacheEntry = {
  research?: ResearchReport;
  planner?: CachedPlannerResult;
  deliverable?: Deliverable;
  deliverableType?: DeliverableType;
  /** Raw worker JSON output — preferred for cache replay. */
  workerOutput?: string;
  createdAt: string;
};

const cache = new Map<string, WorkflowCacheEntry>();

function normalizeAssignment(text: string): string {
  return text.trim().replace(/\r\n/g, "\n");
}

/** SHA-256 hash of the exact normalized user request. */
export function hashAssignment(assignment: string): string {
  return createHash("sha256")
    .update(normalizeAssignment(assignment))
    .digest("hex")
    .slice(0, 16);
}

/** Build cache key metadata for diagnostics and lookup. */
export function buildWorkflowCacheKeyMeta(
  input: WorkflowCacheKeyInput,
): WorkflowCacheKeyMeta {
  const workflowVersion = input.workflowVersion ?? ATLAS_WORKFLOW_VERSION;
  const policyVersion = input.policyVersion ?? ATLAS_POLICY_VERSION;
  const assignmentHash = hashAssignment(input.assignment);
  const companyTemplateId = input.companyTemplateId ?? "";
  const companyId = input.companyId ?? "";

  const payload = [
    assignmentHash,
    input.deliverableType,
    companyTemplateId,
    companyId,
    workflowVersion,
    policyVersion,
  ].join("|");

  return {
    key: createHash("sha256").update(payload).digest("hex").slice(0, 32),
    assignmentHash,
    deliverableType: input.deliverableType,
    companyTemplateId,
    companyId,
    workflowVersion,
    policyVersion,
  };
}

/** Hash key: request hash + deliverable type + company + template + workflow/policy version. */
export function buildWorkflowCacheKey(input: WorkflowCacheKeyInput): string {
  return buildWorkflowCacheKeyMeta(input).key;
}

export function getWorkflowCache(key: string): WorkflowCacheEntry | undefined {
  return cache.get(key);
}

export function setWorkflowCache(
  key: string,
  patch: Partial<WorkflowCacheEntry>,
): WorkflowCacheEntry {
  const existing = cache.get(key) ?? { createdAt: new Date().toISOString() };
  const next = { ...existing, ...patch };
  cache.set(key, next);
  return next;
}

export function clearWorkflowCache(): void {
  cache.clear();
}

/** Only replay cache when deliverable category matches the current request. */
export function canReplayCachedPlanner(
  entry: WorkflowCacheEntry | undefined,
  expectedType: DeliverableType,
): boolean {
  if (!entry?.planner) return false;
  if (entry.deliverableType && !deliverableTypesMatch(expectedType, entry.deliverableType)) {
    return false;
  }
  if (entry.planner.deliverableType) {
    return deliverableTypesMatch(expectedType, entry.planner.deliverableType);
  }
  return true;
}

export function canReplayCachedDeliverable(
  entry: WorkflowCacheEntry | undefined,
  expectedType: DeliverableType,
): boolean {
  if (!entry?.deliverable) return false;
  return deliverableTypesMatch(expectedType, entry.deliverable.type);
}

export function canReplayCachedResearch(
  entry: WorkflowCacheEntry | undefined,
  expectedType: DeliverableType,
): boolean {
  if (!entry?.research) return false;
  if (entry.deliverableType && !deliverableTypesMatch(expectedType, entry.deliverableType)) {
    return false;
  }
  return true;
}

export function canReplayCachedWorker(
  entry: WorkflowCacheEntry | undefined,
  expectedType: DeliverableType,
): boolean {
  if (!entry?.workerOutput && !entry?.deliverable) return false;
  if (entry.deliverableType && !deliverableTypesMatch(expectedType, entry.deliverableType)) {
    return false;
  }
  if (entry.deliverable) {
    return deliverableTypesMatch(expectedType, entry.deliverable.type);
  }
  return true;
}
