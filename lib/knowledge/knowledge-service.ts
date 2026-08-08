import "server-only";

import type { OrchestrationResult } from "@/lib/orchestration/types";

import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

import { extractKnowledgeFromWorkflow } from "./ingest";
import { serverKnowledgeRepository } from "./repositories/server-knowledge-repository";
import type { KnowledgeRepository } from "./repositories/types";
import {
  buildKnowledgeRetrievalResult,
  rankKnowledgeEntries,
} from "./retrieval";
import type {
  IngestWorkflowInput,
  KnowledgeEntry,
  KnowledgeFilter,
  KnowledgeRetrievalResult,
  KnowledgeSearchParams,
} from "./types";

export class KnowledgeService {
  constructor(
    private readonly repository: KnowledgeRepository = serverKnowledgeRepository,
  ) {}

  listForUser(
    userId: string,
    filter?: Omit<KnowledgeFilter, "userId">,
  ): Promise<KnowledgeEntry[]> {
    return this.repository.list({ ...filter, userId });
  }

  /** @deprecated Prefer listForUser — unscoped list is forbidden at API boundary. */
  list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]> {
    return this.repository.list(filter);
  }

  getByIdForUser(id: string, userId: string): Promise<KnowledgeEntry | null> {
    return this.repository.list({ userId, ids: [id] }).then((rows) => rows[0] ?? null);
  }

  getById(id: string): Promise<KnowledgeEntry | null> {
    return this.repository.findById(id);
  }

  async search(params: KnowledgeSearchParams): Promise<KnowledgeEntry[]> {
    const all = await this.repository.list({ userId: params.userId });
    const pool = params.reusableOnly
      ? all.filter((entry) => entry.reusable)
      : all;

    return rankKnowledgeEntries(pool, params.query, params.limit ?? 12);
  }

  /** Retrieve knowledge contexts before a workflow begins (tenant-scoped). */
  async retrieveForWorkflow(
    assignment: string,
    workflowId: string,
    deliverableType: DeliverableType,
    userId?: string | null,
  ): Promise<KnowledgeRetrievalResult> {
    // P0-03 fail-closed: without userId, return empty (never leak global knowledge).
    const all = userId
      ? await this.repository.list({ userId })
      : [];
    const pool = all.filter((entry) => entry.reusable);

    return buildKnowledgeRetrievalResult(assignment, workflowId, pool, deliverableType);
  }

  /** Persist learnings from a completed workflow. */
  async ingestFromWorkflow(
    result: OrchestrationResult,
    input: IngestWorkflowInput,
  ): Promise<KnowledgeEntry[]> {
    if (result.status !== "completed") {
      return [];
    }
    if (!input.userId?.trim()) {
      return [];
    }

    const payloads = extractKnowledgeFromWorkflow(result, input);
    if (payloads.length === 0) return [];

    return this.repository.createMany(payloads);
  }
}

export const knowledgeService = new KnowledgeService();
