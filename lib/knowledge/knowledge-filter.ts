import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import {
  classifyDeliverableType,
  classifyKnowledgeEntryType,
  deliverableTypesRelated,
  knowledgeConflictsWithDeliverableType,
} from "@/lib/orchestration/deliverable-classification";

import type { KnowledgeCategory, KnowledgeEntry } from "./types";

/** Minimum normalized relevance (0–1) to inject knowledge into a workflow. */
export const KNOWLEDGE_RELEVANCE_MIN = 0.75;

/** Max knowledge entries injected per workflow stage. */
export const KNOWLEDGE_RETRIEVAL_LIMIT = 3;

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "を",
  "に",
  "の",
  "は",
  "が",
  "と",
  "で",
  "する",
  "ください",
]);

/** Never inject these categories into planner/worker context. */
export const BLOCKED_INJECTION_CATEGORIES: ReadonlySet<KnowledgeCategory> = new Set([
  "mistake",
  "quality",
  "research",
  "ceo_approval",
]);

/** Categories allowed for planner context. */
export const PLANNER_KNOWLEDGE_CATEGORIES: ReadonlySet<KnowledgeCategory> = new Set([
  "project_summary",
  "deliverable",
  "reusable_strategy",
  "company_learning",
  "lesson_learned",
]);

/** Categories allowed for worker context. */
export const WORKER_KNOWLEDGE_CATEGORIES: ReadonlySet<KnowledgeCategory> = new Set([
  "deliverable",
  "reusable_strategy",
  "company_learning",
  "lesson_learned",
]);

/** Reference-only — shown in UI under 参考ナレッジ, not injected into agents. */
export const REFERENCE_ONLY_CATEGORIES: ReadonlySet<KnowledgeCategory> = new Set([
  "user_feedback",
]);

export type KnowledgeInjectionTarget = "planner" | "worker" | "ceo" | "reference" | "none";

export type KnowledgeFilterDecision = {
  entryId: string;
  title: string;
  category: KnowledgeCategory;
  entryType: DeliverableType | null;
  relevanceScore: number;
  included: boolean;
  target: KnowledgeInjectionTarget;
  reason: string;
};

export type KnowledgeFilterDiagnostics = {
  deliverableType: DeliverableType;
  retrievedCount: number;
  filteredCount: number;
  discardedCount: number;
  decisions: KnowledgeFilterDecision[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s、。,.;:!?()[\]{}'"\/\\|+\-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function entryText(entry: KnowledgeEntry): string {
  return [entry.title, entry.summary, entry.content ?? "", ...entry.tags].join(" ");
}

/** Normalized relevance score in range 0–1. */
export function computeNormalizedRelevance(
  entry: KnowledgeEntry,
  queryTokens: readonly string[],
): number {
  if (queryTokens.length === 0) {
    return Math.min(1, entry.confidence / 100);
  }

  const haystack = entryText(entry).toLowerCase();
  let matchWeight = 0;
  let totalWeight = 0;

  for (const token of queryTokens) {
    const weight = token.length >= 4 ? 1 : 0.7;
    totalWeight += weight;
    if (haystack.includes(token)) {
      matchWeight += weight;
    }
  }

  const overlap = totalWeight > 0 ? matchWeight / totalWeight : 0;
  const confidence = entry.confidence / 100;
  return Math.min(1, overlap * 0.7 + confidence * 0.3);
}

function resolveInjectionTarget(
  entry: KnowledgeEntry,
  deliverableType: DeliverableType,
): KnowledgeInjectionTarget {
  if (BLOCKED_INJECTION_CATEGORIES.has(entry.category)) return "none";
  if (REFERENCE_ONLY_CATEGORIES.has(entry.category)) return "reference";

  const plannerOk = PLANNER_KNOWLEDGE_CATEGORIES.has(entry.category);
  const workerOk = WORKER_KNOWLEDGE_CATEGORIES.has(entry.category) && entry.reusable;

  if (plannerOk && workerOk) return "worker";
  if (plannerOk) return "planner";
  if (workerOk) return "worker";
  return "reference";
}

function evaluateEntry(
  entry: KnowledgeEntry,
  queryTokens: readonly string[],
  deliverableType: DeliverableType,
): KnowledgeFilterDecision {
  const relevanceScore = computeNormalizedRelevance(entry, queryTokens);
  const entryType = classifyKnowledgeEntryType(entry);
  const target = resolveInjectionTarget(entry, deliverableType);

  if (BLOCKED_INJECTION_CATEGORIES.has(entry.category)) {
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      entryType,
      relevanceScore,
      included: false,
      target: "none",
      reason: `Category "${entry.category}" is not injected into new workflows`,
    };
  }

  if (REFERENCE_ONLY_CATEGORIES.has(entry.category)) {
    const include =
      relevanceScore >= KNOWLEDGE_RELEVANCE_MIN &&
      !knowledgeConflictsWithDeliverableType(entryText(entry), deliverableType);
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      entryType,
      relevanceScore,
      included: include,
      target: "reference",
      reason: include
        ? "Reference-only — shown under 参考ナレッジ"
        : relevanceScore < KNOWLEDGE_RELEVANCE_MIN
          ? `Relevance ${relevanceScore.toFixed(2)} below threshold ${KNOWLEDGE_RELEVANCE_MIN}`
          : "Type mismatch with current request",
    };
  }

  if (relevanceScore < KNOWLEDGE_RELEVANCE_MIN) {
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      entryType,
      relevanceScore,
      included: false,
      target: "none",
      reason: `Relevance ${relevanceScore.toFixed(2)} below threshold ${KNOWLEDGE_RELEVANCE_MIN}`,
    };
  }

  if (knowledgeConflictsWithDeliverableType(entryText(entry), deliverableType)) {
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      entryType,
      relevanceScore,
      included: false,
      target: "none",
      reason: `Content conflicts with deliverable type "${deliverableType}"`,
    };
  }

  if (entryType && !deliverableTypesRelated(deliverableType, entryType)) {
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      entryType,
      relevanceScore,
      included: false,
      target: "none",
      reason: `Entry type "${entryType}" not related to request type "${deliverableType}"`,
    };
  }

  if (target === "none") {
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      entryType,
      relevanceScore,
      included: false,
      target: "none",
      reason: "Category not eligible for injection",
    };
  }

  return {
    entryId: entry.id,
    title: entry.title,
    category: entry.category,
    entryType,
    relevanceScore,
    included: true,
    target,
    reason: `Included for ${target} (score ${relevanceScore.toFixed(2)})`,
  };
}

export type FilteredKnowledgeResult = {
  referenceEntries: KnowledgeEntry[];
  plannerEntries: KnowledgeEntry[];
  workerEntries: KnowledgeEntry[];
  diagnostics: KnowledgeFilterDiagnostics;
};

/** Filter knowledge for the current workflow with full diagnostics. */
export function filterKnowledgeForWorkflow(
  entries: readonly KnowledgeEntry[],
  query: string,
  deliverableType: DeliverableType,
): FilteredKnowledgeResult {
  const tokens = tokenize(query);

  const decisions = entries.map((entry) => evaluateEntry(entry, tokens, deliverableType));

  const included = decisions
    .filter((d) => d.included)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const referenceEntries = included
    .filter((d) => d.target === "reference" || d.target === "worker" || d.target === "planner")
    .slice(0, KNOWLEDGE_RETRIEVAL_LIMIT)
    .map((d) => entries.find((e) => e.id === d.entryId)!)
    .filter(Boolean);

  const plannerEntries = included
    .filter((d) => d.target === "planner" || d.target === "worker")
    .slice(0, KNOWLEDGE_RETRIEVAL_LIMIT)
    .map((d) => entries.find((e) => e.id === d.entryId)!)
    .filter(Boolean);

  const workerEntries = included
    .filter((d) => d.target === "worker")
    .slice(0, KNOWLEDGE_RETRIEVAL_LIMIT)
    .map((d) => entries.find((e) => e.id === d.entryId)!)
    .filter(Boolean);

  return {
    referenceEntries,
    plannerEntries,
    workerEntries,
    diagnostics: {
      deliverableType,
      retrievedCount: entries.length,
      filteredCount: included.length,
      discardedCount: entries.length - included.length,
      decisions,
    },
  };
}

export function formatKnowledgeEntries(
  title: string,
  entries: readonly KnowledgeEntry[],
): string {
  if (entries.length === 0) return "";

  return entries
    .map(
      (entry, index) =>
        `${index + 1}. [${entry.category}] ${entry.title}\n   ${entry.summary}`,
    )
    .join("\n");
}
