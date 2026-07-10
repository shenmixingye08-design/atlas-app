export const WORK_MEMORY_TYPES = [
  "workflow",
  "preference",
  "template",
  "habit",
  "correction",
  "result",
  "outcome",
] as const;

export type WorkMemoryType = (typeof WORK_MEMORY_TYPES)[number];

export const WORK_MEMORY_SOURCE_TYPES = [
  "orchestration",
  "user_edit",
  "user_explicit",
  "correction_diff",
  "reference_material",
  "repeated_request",
  "manual",
] as const;

export type WorkMemorySourceType = (typeof WORK_MEMORY_SOURCE_TYPES)[number];

export type WorkMemoryRecord = {
  id: string;
  userId: string;
  type: WorkMemoryType;
  title: string;
  summary: string;
  structuredData: Record<string, unknown>;
  sourceType: WorkMemorySourceType;
  sourceReference: string | null;
  tags: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  usageCount: number;
  isActive: boolean;
  isUserConfirmed: boolean;
};

export type WorkMemoryCandidate = {
  candidateId: string;
  userId: string;
  type: WorkMemoryType;
  title: string;
  summary: string;
  structuredData: Record<string, unknown>;
  sourceType: WorkMemorySourceType;
  sourceReference: string | null;
  tags: string[];
  confidence: number;
  reason: string;
  createdAt: string;
};

export type WorkMemorySettings = {
  enabled: boolean;
};

export type WorkMemorySummary = {
  id: string;
  type: WorkMemoryType;
  title: string;
  summary: string;
  isUserConfirmed: boolean;
};

export type WorkMemoryUsedContext = {
  message: string;
  used: WorkMemorySummary[];
};

export type CreateWorkMemoryInput = {
  type: WorkMemoryType;
  title: string;
  summary: string;
  structuredData?: Record<string, unknown>;
  sourceType?: WorkMemorySourceType;
  sourceReference?: string | null;
  tags?: string[];
  confidence?: number;
  isUserConfirmed?: boolean;
};

export type UpdateWorkMemoryInput = Partial<
  Pick<
    WorkMemoryRecord,
    | "type"
    | "title"
    | "summary"
    | "structuredData"
    | "tags"
    | "confidence"
    | "isActive"
    | "isUserConfirmed"
  >
>;

export type WorkMemoryListFilters = {
  type?: WorkMemoryType | "all";
  query?: string;
  activeOnly?: boolean;
  includeUnconfirmed?: boolean;
};

export type WorkMemoryListResponse = {
  memories: WorkMemoryRecord[];
  candidates: WorkMemoryCandidate[];
  settings: WorkMemorySettings;
  total: number;
};

export type WorkMemoryResetInput = {
  type?: WorkMemoryType;
  all?: boolean;
};

export const MAX_WORK_MEMORIES_PER_USER = 300;
export const MAX_CANDIDATES_PER_USER = 50;
