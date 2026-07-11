import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { createProjectFromOrchestration } from "@/lib/projects/domain";
import { mapProjectToRow, PROJECTS_TABLE } from "@/lib/projects/repositories/project-row";
import { createClientIfConfigured } from "@/lib/supabase/client";
import type { OrchestrationResult } from "@/lib/orchestration/types";

import type { CommanderRunRecord } from "./types";

const CLERK_COMMANDER_KEY = "atlasCommanderRuns";
const MAX_CLERK_RUNS = 40;

/** Compact durable snapshot — fits Clerk privateMetadata limits. */
export type DurableCommanderRunSnapshot = {
  id: string;
  userId: string;
  assignment: string;
  status: CommanderRunRecord["status"];
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
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string | null;
};

function toSnapshot(run: CommanderRunRecord): DurableCommanderRunSnapshot {
  return {
    id: run.id,
    userId: run.userId,
    assignment: run.assignment.slice(0, 2000),
    status: run.status,
    planSummary: run.plan.classification.summary,
    templateLabel: run.plan.requiredTemplate.label,
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

/** Persist compact run list to Clerk (survives Vercel cold starts). */
export async function persistCommanderRunToClerk(
  run: CommanderRunRecord,
): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(run.userId);
    const existingMeta =
      user.privateMetadata && typeof user.privateMetadata === "object"
        ? { ...user.privateMetadata }
        : {};
    const previous = Array.isArray(existingMeta[CLERK_COMMANDER_KEY])
      ? (existingMeta[CLERK_COMMANDER_KEY] as unknown[]).filter(isSnapshot)
      : [];

    const snapshot = toSnapshot(run);
    const next = [
      snapshot,
      ...previous.filter((item) => item.id !== snapshot.id),
    ].slice(0, MAX_CLERK_RUNS);

    await client.users.updateUserMetadata(run.userId, {
      privateMetadata: {
        ...existingMeta,
        [CLERK_COMMANDER_KEY]: next,
      },
    });
  } catch (error) {
    console.error("[commander] Failed to persist run to Clerk:", error);
  }
}

export async function loadCommanderRunsFromClerk(
  userId: string,
): Promise<DurableCommanderRunSnapshot[]> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return [];

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const raw = user.privateMetadata?.[CLERK_COMMANDER_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.filter(isSnapshot).filter((item) => item.userId === userId);
  } catch {
    return [];
  }
}

/**
 * Best-effort project row upsert when Supabase is configured.
 * Does not replace client localStorage history — supplements it for production.
 */
export async function persistCommanderResultAsProject(input: {
  userId: string;
  assignment: string;
  result: OrchestrationResult;
}): Promise<string | null> {
  const client = createClientIfConfigured();
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
