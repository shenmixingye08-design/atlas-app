import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

import {
  filterKnowledgeForWorkflow,
  formatKnowledgeEntries,
  KNOWLEDGE_RETRIEVAL_LIMIT,
} from "./knowledge-filter";
import type { KnowledgeFilterDiagnostics } from "./knowledge-filter";
import type { KnowledgeEntry, KnowledgeRetrievalResult } from "./types";

export { KNOWLEDGE_RELEVANCE_MIN, KNOWLEDGE_RETRIEVAL_LIMIT } from "./knowledge-filter";
export type { KnowledgeFilterDecision, KnowledgeFilterDiagnostics } from "./knowledge-filter";

/** @deprecated Use filterKnowledgeForWorkflow with KNOWLEDGE_RELEVANCE_MIN instead. */
export const KNOWLEDGE_RELEVANCE_THRESHOLD = 0.75;

export function rankKnowledgeEntries(
  entries: readonly KnowledgeEntry[],
  query: string,
  limit = KNOWLEDGE_RETRIEVAL_LIMIT,
  deliverableType?: DeliverableType,
): KnowledgeEntry[] {
  if (!deliverableType) {
    return [...entries].slice(0, limit);
  }

  const filtered = filterKnowledgeForWorkflow(entries, query, deliverableType);
  return filtered.referenceEntries.slice(0, limit);
}

export function buildRetrievalContexts(
  ranked: KnowledgeEntry[],
  plannerEntries: KnowledgeEntry[],
  workerEntries: KnowledgeEntry[],
  deliverableType?: DeliverableType,
): Omit<
  KnowledgeRetrievalResult,
  "query" | "retrievedAt" | "workflowId" | "entries" | "diagnostics"
> {
  const similarProjects = plannerEntries.filter(
    (entry) => entry.category === "project_summary" || entry.category === "deliverable",
  );

  const strategies = plannerEntries.filter(
    (entry) =>
      entry.category === "reusable_strategy" || entry.category === "company_learning",
  );

  const workerContextByTaskKeyword: Record<string, string> = {};
  for (const entry of workerEntries) {
    for (const tag of entry.tags.slice(0, 2)) {
      if (!workerContextByTaskKeyword[tag]) {
        workerContextByTaskKeyword[tag] = entry.summary;
      }
    }
  }

  return {
    ceoContext: formatKnowledgeEntries("参考ナレッジ", ranked.slice(0, 2)),
    plannerContext: {
      similarProjects: formatKnowledgeEntries("類似プロジェクト", similarProjects),
      previousMistakes: "",
      successfulStrategies: formatKnowledgeEntries("成功した進め方", strategies),
      preferredFormats: deliverableType
        ? `Target deliverable type for this workflow: ${deliverableType}`
        : "",
    },
    workerContext: formatKnowledgeEntries("参考ナレッジ", workerEntries),
    workerContextByTaskKeyword,
    qaMistakesToAvoid: "",
  };
}

export function buildKnowledgeRetrievalResult(
  query: string,
  workflowId: string,
  allEntries: KnowledgeEntry[],
  deliverableType: DeliverableType,
): KnowledgeRetrievalResult {
  const filtered = filterKnowledgeForWorkflow(allEntries, query, deliverableType);

  return {
    query,
    retrievedAt: new Date().toISOString(),
    workflowId,
    entries: filtered.referenceEntries,
    diagnostics: filtered.diagnostics,
    ...buildRetrievalContexts(
      filtered.referenceEntries,
      filtered.plannerEntries,
      filtered.workerEntries,
      deliverableType,
    ),
  };
}
