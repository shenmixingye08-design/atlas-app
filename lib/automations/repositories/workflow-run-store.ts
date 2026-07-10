import "server-only";

import type {
  CompleteWorkflowRunInput,
  CreateWorkflowRunInput,
  WorkflowRun,
  WorkflowRunFilter,
} from "@/lib/memory/types/workflow-run";
import type { PageRequest, PageResult } from "@/lib/memory/types/common";

type WorkflowRunBucket = Map<string, WorkflowRun>;

function getBucket(): WorkflowRunBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasWorkflowRunStore?: WorkflowRunBucket;
  };

  if (!globalScope.__atlasWorkflowRunStore) {
    globalScope.__atlasWorkflowRunStore = new Map();
  }

  return globalScope.__atlasWorkflowRunStore;
}

function matchesFilter(run: WorkflowRun, filter?: WorkflowRunFilter): boolean {
  if (!filter) return true;

  if (filter.projectId && run.projectId !== filter.projectId) return false;
  if (filter.userId && run.userId !== filter.userId) return false;

  if (filter.automationId && run.automationId !== filter.automationId) {
    return false;
  }

  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (!statuses.includes(run.status)) return false;
  }

  if (filter.ids && !filter.ids.includes(run.id)) return false;

  return true;
}

/** Server-side {@link WorkflowRun} store for automation and manual executions. */
export class ServerWorkflowRunRepository {
  async findById(id: string): Promise<WorkflowRun | null> {
    return getBucket().get(id) ?? null;
  }

  async list(
    filter?: WorkflowRunFilter,
    page?: PageRequest,
  ): Promise<PageResult<WorkflowRun>> {
    const limit = page?.limit ?? 50;
    const offset = page?.offset ?? 0;

    const items = [...getBucket().values()]
      .filter((run) => matchesFilter(run, filter))
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
    };
  }

  async start(input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    const now = new Date().toISOString();
    const run: WorkflowRun = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      userId: input.userId ?? null,
      assignment: input.assignment,
      status: "failed",
      approved: false,
      totalDurationMs: 0,
      finalResponsePreview: null,
      result: null,
      error: null,
      startedAt: input.startedAt ?? now,
      completedAt: null,
      createdAt: now,
      automationId: input.automationId ?? null,
      triggerType: input.triggerType ?? "manual",
    };

    getBucket().set(run.id, run);
    return run;
  }

  async complete(input: CompleteWorkflowRunInput): Promise<WorkflowRun> {
    const existing = getBucket().get(input.id);
    if (!existing) {
      throw new Error(`WorkflowRun not found: ${input.id}`);
    }

    const completed: WorkflowRun = {
      ...existing,
      status: input.status,
      approved: input.approved,
      totalDurationMs: input.totalDurationMs,
      result: input.result,
      finalResponsePreview: input.finalResponsePreview ?? null,
      error: input.error ?? null,
      completedAt: input.completedAt ?? new Date().toISOString(),
    };

    getBucket().set(input.id, completed);
    return completed;
  }
}

export const serverWorkflowRunRepository = new ServerWorkflowRunRepository();
