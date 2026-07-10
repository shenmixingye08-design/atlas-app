import type {
  CreateWorkMemoryInput,
  UpdateWorkMemoryInput,
  WorkMemoryListFilters,
  WorkMemoryListResponse,
  WorkMemoryRecord,
  WorkMemoryResetInput,
  WorkMemorySettings,
  WorkMemorySummary,
  WorkMemoryType,
  WorkMemoryCandidate,
} from "./types";

export type {
  CreateWorkMemoryInput,
  UpdateWorkMemoryInput,
  WorkMemoryListFilters,
  WorkMemoryListResponse,
  WorkMemoryRecord,
  WorkMemoryResetInput,
  WorkMemorySettings,
  WorkMemorySummary,
  WorkMemoryType,
  WorkMemoryCandidate,
  WorkMemoryUsedContext,
} from "./types";

export { WORK_MEMORY_TYPES, MAX_WORK_MEMORIES_PER_USER } from "./types";

export {
  getWorkMemoryTypeLabel,
  getWorkMemorySourceLabel,
  formatWorkMemoryConfidence,
  formatWorkMemoryConfidencePercent,
  WORK_MEMORY_TYPE_LABELS,
  WORK_MEMORY_SOURCE_LABELS,
} from "./labels";

export {
  formatWorkMemoriesForPlanner,
  readWorkMemoryFromMetadata,
  buildWorkMemoryMetadata,
  summarizeWorkMemoriesForClient,
  shouldSkipWorkMemory,
} from "./metadata";

export async function fetchWorkMemories(
  filters?: WorkMemoryListFilters,
): Promise<WorkMemoryListResponse> {
  const params = new URLSearchParams();
  if (filters?.query) params.set("q", filters.query);
  if (filters?.type && filters.type !== "all") params.set("type", filters.type);
  if (filters?.activeOnly) params.set("activeOnly", "1");

  const query = params.toString();
  const response = await fetch(`/api/work-memory${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load work memories");
  return response.json() as Promise<WorkMemoryListResponse>;
}

export async function createWorkMemoryClient(
  input: CreateWorkMemoryInput,
): Promise<WorkMemoryRecord> {
  const response = await fetch("/api/work-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to create work memory");
  const payload = (await response.json()) as { memory: WorkMemoryRecord };
  return payload.memory;
}

export async function updateWorkMemoryClient(
  id: string,
  patch: UpdateWorkMemoryInput,
): Promise<WorkMemoryRecord> {
  const response = await fetch(`/api/work-memory/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Failed to update work memory");
  const payload = (await response.json()) as { memory: WorkMemoryRecord };
  return payload.memory;
}

export async function deleteWorkMemoryClient(id: string): Promise<void> {
  const response = await fetch(`/api/work-memory/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete work memory");
}

export async function resetWorkMemoriesClient(
  input: WorkMemoryResetInput,
): Promise<{ deleted: number }> {
  const response = await fetch("/api/work-memory/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to reset work memories");
  return response.json() as Promise<{ deleted: number }>;
}

export async function fetchWorkMemorySettings(): Promise<WorkMemorySettings> {
  const response = await fetch("/api/work-memory/settings", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load work memory settings");
  return response.json() as Promise<WorkMemorySettings>;
}

export async function updateWorkMemorySettingsClient(
  enabled: boolean,
): Promise<WorkMemorySettings> {
  const response = await fetch("/api/work-memory/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) throw new Error("Failed to update work memory settings");
  return response.json() as Promise<WorkMemorySettings>;
}

export async function confirmWorkMemoryCandidateClient(
  candidateId: string,
): Promise<WorkMemoryRecord> {
  const response = await fetch(
    `/api/work-memory/candidates/${encodeURIComponent(candidateId)}/confirm`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Failed to confirm candidate");
  const payload = (await response.json()) as { memory: WorkMemoryRecord };
  return payload.memory;
}

export async function rejectWorkMemoryCandidateClient(
  candidateId: string,
): Promise<void> {
  const response = await fetch(
    `/api/work-memory/candidates/${encodeURIComponent(candidateId)}/reject`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Failed to reject candidate");
}

export async function previewWorkMemoriesClient(
  assignment: string,
): Promise<WorkMemorySummary[]> {
  const params = new URLSearchParams({ assignment });
  const response = await fetch(`/api/work-memory/preview?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to preview work memories");
  const payload = (await response.json()) as { used: WorkMemorySummary[] };
  return payload.used;
}

export async function submitCorrectionLearningClient(input: {
  before: string;
  after: string;
  sourceReference?: string;
}): Promise<{ candidateCreated: boolean }> {
  const response = await fetch("/api/work-memory/correction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to submit correction learning");
  return response.json() as Promise<{ candidateCreated: boolean }>;
}
