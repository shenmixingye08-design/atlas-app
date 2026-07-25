export const MEMORY_SCOPES = [
  "user",
  "project",
  "job",
  "conversation",
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_SOURCES = [
  "explicit_user_instruction",
  "repeated_preference",
  "approved_output",
  "imported_profile",
  "system_inference",
] as const;

export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_STATUSES = [
  "active",
  "superseded",
  "archived",
  "deleted",
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type HierarchicalMemoryRecord = {
  id: string;
  userId: string;
  scope: MemoryScope;
  projectId: string | null;
  jobId: string | null;
  automationId: string | null;
  category: string;
  key: string;
  value: string;
  source: MemorySource;
  confidence: number;
  priority: number;
  isTemporary: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  useCount: number;
  status: MemoryStatus;
};

export type MemoryResolveContext = {
  userId: string;
  assignment: string;
  projectId?: string | null;
  jobId?: string | null;
  automationId?: string | null;
  now?: Date;
};

export type ResolvedMemoryBundle = {
  applied: HierarchicalMemoryRecord[];
  temporary: HierarchicalMemoryRecord[];
  promptBlock: string;
  usedIds: string[];
  excludedIds: string[];
};

export type MissingInfoQuestion = {
  id: string;
  question: string;
  severity: "critical" | "minor";
  key: string;
};

export type MissingInfoAssessment = {
  questions: MissingInfoQuestion[];
  assumptions: string[];
  canProceed: boolean;
  reason: string;
};

export type SaveCandidate = {
  scope: MemoryScope;
  category: string;
  key: string;
  value: string;
  source: MemorySource;
  confidence: number;
  isTemporary: boolean;
  expiresAt: string | null;
  projectId?: string | null;
  jobId?: string | null;
  automationId?: string | null;
};
