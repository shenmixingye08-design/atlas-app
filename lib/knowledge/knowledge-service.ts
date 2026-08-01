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
    private readonly repository: KnowledgeRepository = serverKnowledgeRepository
  ) {}

  list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]> {
    if (!filter?.userId) return Promise.resolve([]);
    return this.repository.list(filter);
  }

  getById(id: string, userId: string): Promise<KnowledgeEntry | null> {
    return this.repository.findById(id, userId);
  }

  async search(params: KnowledgeSearchParams): Promise<KnowledgeEntry[]> {
    if (!params.userId) return [];
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
    userId: string
  ): Promise<KnowledgeRetrievalResult> {
    if (!userId) {
      return buildKnowledgeRetrievalResult(
        assignment,
        workflowId,
        [],
        deliverableType
      );
    }
    const all = await this.repository.list({ userId });
    const pool = all.filter((entry) => entry.reusable);

    return buildKnowledgeRetrievalResult(
      assignment,
      workflowId,
      pool,
      deliverableType
    );
  }

  /** Persist learnings from a completed workflow (tenant-scoped). */
  async ingestFromWorkflow(
    result: OrchestrationResult,
    input: IngestWorkflowInput
  ): Promise<KnowledgeEntry[]> {
    if (result.status !== "completed") {
      return [];
    }
    if (!input.userId) return [];

    const payloads = extractKnowledgeFromWorkflow(result, input);
    if (payloads.length === 0) return [];

    return this.repository.createMany(
      payloads.map((p) => ({ ...p, userId: input.userId! }))
    );
  }
}

export const knowledgeService = new KnowledgeService();
