import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { loadClerkPrivateMetadataKey } from "@/lib/persistence/clerk-private-metadata";
import { createProjectFromOrchestration } from "@/lib/projects/domain";
import { mapProjectToRow, PROJECTS_TABLE } from "@/lib/projects/repositories/project-row";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import type { OrchestrationResult } from "@/lib/orchestration/types";

import type { CommanderPlan, CommanderRunRecord } from "./types";

export const COMMANDER_DOMAIN_KEY = "atlasCommanderRuns";
const MAX_DURABLE_RUNS = 40;

/** Durable snapshot — includes plan so confirm/resume survives cold starts. */
export type DurableCommanderRunSnapshot = {
  id: string;
  userId: string;
  assignment: string;
  status: CommanderRunRecord["status"];
  plan?: CommanderPlan;
  planSummary: string;
  templateLabel: string;
  confirmationReasons: string[];
  attemptCount: number;
  error: string | null;
  resultPreview: string | null;
  workMemoryIds: string[];
  workMemoryTitles: string[];
  workflowRunId: string | null;
  projectId: string | null;
  cancelRequested?: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string | null;
};

function stubPlan(snapshot: DurableCommanderRunSnapshot): CommanderPlan {
  return {
    assignment: snapshot.assignment,
    classification: {
      deliverableType: "document",
      templateId: "generic",
      summary: snapshot.planSummary || snapshot.assignment.slice(0, 120),
      keywords: [],
    },
    requiredAis: [],
    requiredExternalServices: [],
    requiredTemplate: {
      templateId: "generic",
      label: snapshot.templateLabel || "汎用",
      stepIds: [],
      stepLabels: [],
    },
    requiredMemory: {
      workMemoryIds: snapshot.workMemoryIds ?? [],
      workMemoryTitles: snapshot.workMemoryTitles ?? [],
      workMemoryTypes: [],
      learningKeys: [],
      summary: "",
    },
    executionOrder: [],
    maxRetries: 2,
    generatedAt: snapshot.createdAt,
  };
}

function toSnapshot(run: CommanderRunRecord): DurableCommanderRunSnapshot {
  return {
    id: run.id,
    userId: run.userId,
    assignment: run.assignment.slice(0, 2000),
    status: run.status,
    plan: run.plan,
    planSummary: run.plan.classification.summary.slice(0, 400),
    templateLabel: run.plan.requiredTemplate.label.slice(0, 120),
    confirmationReasons: run.confirmationReasons.slice(0, 8),
    attemptCount: run.attempts.length,
    error: run.error ? run.error.slice(0, 500) : null,
    resultPreview: run.result?.finalResponse
      ? run.result.finalResponse.slice(0, 400)
      : null,
    workMemoryIds: run.plan.requiredMemory.workMemoryIds.slice(0, 20),
    workMemoryTitles: run.plan.requiredMemory.workMemoryTitles.slice(0, 20),
    workflowRunId: run.workflowRunId,
    projectId: null,
    cancelRequested: run.cancelRequested,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.createdAt,
    endedAt:
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "partial" ||
      run.status === "cancelled"
        ? run.updatedAt
        : null,
  };
}

function isSnapshot(value: unknown): value is DurableCommanderRunSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.userId === "string" &&
    typeof row.assignment === "string" &&
    typeof row.status === "string"
  );
}

/** Reconstruct an in-memory run from a durable snapshot (result body omitted). */
export function snapshotToCommanderRun(
  snapshot: DurableCommanderRunSnapshot,
): CommanderRunRecord {
  return {
    id: snapshot.id,
    userId: snapshot.userId,
    assignment: snapshot.assignment,
    status: snapshot.status,
    plan: snapshot.plan ?? stubPlan(snapshot),
    confirmationReasons: snapshot.confirmationReasons ?? [],
    attempts: Array.from({ length: snapshot.attemptCount || 0 }, (_, index) => ({
      attempt: index + 1,
      status:
        snapshot.status === "failed"
          ? "failed"
          : snapshot.status === "partial"
            ? "partial"
            : snapshot.status === "cancelled"
              ? "cancelled"
              : "completed",
      error: index === (snapshot.attemptCount || 1) - 1 ? snapshot.error : null,
      durationMs: 0,
    })),
    result: null,
    error: snapshot.error,
    workflowRunId: snapshot.workflowRunId,
    cancelRequested: Boolean(snapshot.cancelRequested),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

function compactRuns(runs: DurableCommanderRunSnapshot[]): DurableCommanderRunSnapshot[] {
  return runs.slice(0, 20).map((run) => ({
    ...run,
    assignment: run.assignment.slice(0, 800),
    planSummary: run.planSummary.slice(0, 200),
    resultPreview: run.resultPreview ? run.resultPreview.slice(0, 200) : null,
    plan: run.plan
      ? {
          ...run.plan,
          assignment: run.plan.assignment.slice(0, 800),
          requiredAis: run.plan.requiredAis.slice(0, 12),
          requiredExternalServices: run.plan.requiredExternalServices.slice(0, 8),
          executionOrder: run.plan.executionOrder.slice(0, 16),
        }
      : undefined,
  }));
}

type DurableCommanderState = {
  runs: DurableCommanderRunSnapshot[];
};

async function loadSnapshots(userId: string): Promise<DurableCommanderRunSnapshot[]> {
  const fromDomain = await loadDurableDomain<DurableCommanderState>(
    userId,
    COMMANDER_DOMAIN_KEY,
  );
  if (fromDomain && Array.isArray(fromDomain.runs)) {
    return fromDomain.runs.filter(isSnapshot);
  }

  // Legacy: raw array written before envelope format.
  const legacy = await loadClerkPrivateMetadataKey<unknown>(
    userId,
    COMMANDER_DOMAIN_KEY,
  );
  if (Array.isArray(legacy)) {
    return legacy.filter(isSnapshot).filter((item) => item.userId === userId);
  }

  return [];
}

/** Persist run list (Clerk-first; Supabase only when payload exceeds Clerk limits). */
export async function persistCommanderRunToClerk(
  run: CommanderRunRecord,
): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return;

  try {
    const previous = await loadSnapshots(run.userId);
    const snapshot = toSnapshot(run);
    const next = [
      snapshot,
      ...previous.filter((item) => item.id !== snapshot.id),
    ].slice(0, MAX_DURABLE_RUNS);

    await persistDurableDomain(
      run.userId,
      COMMANDER_DOMAIN_KEY,
      { runs: next } satisfies DurableCommanderState,
      { compact: (state) => ({ runs: compactRuns(state.runs) }) },
    );
  } catch (error) {
    console.error("[commander] Failed to persist run:", error);
  }
}

export async function loadCommanderRunsFromClerk(
  userId: string,
): Promise<DurableCommanderRunSnapshot[]> {
  try {
    return (await loadSnapshots(userId)).filter((item) => item.userId === userId);
  } catch {
    return [];
  }
}

/**
 * Best-effort project row upsert via service role (RLS denies anon).
 * Complements durable commander history for recent-work / briefing inputs.
 */
export async function persistCommanderResultAsProject(input: {
  userId: string;
  assignment: string;
  result: OrchestrationResult;
}): Promise<string | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  try {
    const project = createProjectFromOrchestration(input.assignment, input.result);
    const row = mapProjectToRow(project, input.userId);
    const { error } = await client.from(PROJECTS_TABLE).upsert(row);
    if (error) {
      console.warn("[commander] Supabase project upsert failed:", error.message);
      return null;
    }
    return project.id;
  } catch (error) {
    console.warn("[commander] Supabase project persist skipped:", error);
    return null;
  }
}
