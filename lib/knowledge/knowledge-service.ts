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

  list(filter?: KnowledgeFilter): Promise<KnowledgeEntry[]> {
    return this.repository.list(filter);
  }

  getById(id: string): Promise<KnowledgeEntry | null> {
    return this.repository.findById(id);
  }

  async search(params: KnowledgeSearchParams): Promise<KnowledgeEntry[]> {
    const all = await this.repository.list();
    const pool = params.reusableOnly
      ? all.filter((entry) => entry.reusable)
      : all;

    return rankKnowledgeEntries(pool, params.query, params.limit ?? 12);
  }

  /** Retrieve knowledge contexts before a workflow begins. */
  async retrieveForWorkflow(
    assignment: string,
    workflowId: string,
    deliverableType: DeliverableType,
  ): Promise<KnowledgeRetrievalResult> {
    const all = await this.repository.list();
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

    const payloads = extractKnowledgeFromWorkflow(result, input);
    if (payloads.length === 0) return [];

    return this.repository.createMany(payloads);
  }
}

export const knowledgeService = new KnowledgeService();
