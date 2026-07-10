/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Opaque UUID primary key. */
export type EntityId = string;

/** Knowledge category aligned with workflow artifacts. */
export type KnowledgeCategory =
  | "project_summary"
  | "deliverable"
  | "research"
  | "quality"
  | "ceo_approval"
  | "user_feedback"
  | "lesson_learned"
  | "reusable_strategy"
  | "mistake"
  | "company_learning";

/** A single item in the Company Knowledge Base. */
export interface KnowledgeEntry {
  id: EntityId;
  title: string;
  category: KnowledgeCategory;
  tags: readonly string[];
  summary: string;
  sourceWorkflowId: EntityId | null;
  reusable: boolean;
  /** Confidence score 0–100. */
  confidence: number;
  createdAt: Timestamp;
  /** Full text for retrieval scoring (not always shown in UI). */
  content?: string;
  /** Original assignment for similarity matching. */
  assignmentHint?: string;
}

export type CreateKnowledgeInput = {
  title: string;
  category: KnowledgeCategory;
  tags?: readonly string[];
  summary: string;
  sourceWorkflowId?: EntityId | null;
  reusable?: boolean;
  confidence?: number;
  content?: string;
  assignmentHint?: string;
};

export type KnowledgeFilter = {
  category?: KnowledgeCategory | KnowledgeCategory[];
  tags?: readonly string[];
  reusable?: boolean;
  sourceWorkflowId?: EntityId;
  ids?: EntityId[];
};

export type KnowledgeSearchParams = {
  query: string;
  limit?: number;
  reusableOnly?: boolean;
};

/** Structured knowledge passed into agent contexts. */
export type KnowledgeRetrievalResult = {
  query: string;
  retrievedAt: Timestamp;
  workflowId: string;
  entries: KnowledgeEntry[];
  diagnostics: import("./knowledge-filter").KnowledgeFilterDiagnostics;
  ceoContext: string;
  plannerContext: {
    similarProjects: string;
    previousMistakes: string;
    successfulStrategies: string;
    preferredFormats: string;
  };
  workerContext: string;
  workerContextByTaskKeyword: Readonly<Record<string, string>>;
  qaMistakesToAvoid: string;
};

/** Snapshot persisted on {@link OrchestrationResult}. */
export type KnowledgeUsedResult = {
  workflowId: EntityId;
  retrieval: KnowledgeRetrievalResult;
};

export type IngestWorkflowInput = {
  workflowId: EntityId;
  assignment: string;
  userFeedback?: string | null;
};
