import type {
  CandidateDecision,
  CreatePersonalMemoryInput,
  MemoryApplyPreviewItem,
  MemoryImprovementSuggestion,
  MemoryStatus,
  PersonalMemoryRecord,
  PersonalMemorySettings,
  UpdatePersonalMemoryInput,
} from "@/lib/personal-memory/types";
import type {
  DeliverableQualityEvaluation,
  MemoryQualityDashboard,
} from "@/lib/personal-memory/quality/types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "記憶の操作に失敗しました",
    );
  }
  return payload;
}

export async function fetchPersonalMemories(status?: MemoryStatus | "all"): Promise<{
  memories: PersonalMemoryRecord[];
  settings: PersonalMemorySettings;
}> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(`/api/personal-memory${query}`, { cache: "no-store" });
  return parseJson(response);
}

export async function createPersonalMemoryClient(
  input: CreatePersonalMemoryInput,
): Promise<PersonalMemoryRecord> {
  const response = await fetch("/api/personal-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ memory: PersonalMemoryRecord }>(response);
  return payload.memory;
}

export async function updatePersonalMemoryClient(
  id: string,
  patch: UpdatePersonalMemoryInput,
): Promise<PersonalMemoryRecord> {
  const response = await fetch(`/api/personal-memory/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = await parseJson<{ memory: PersonalMemoryRecord }>(response);
  return payload.memory;
}

export async function deletePersonalMemoryClient(id: string): Promise<void> {
  const response = await fetch(`/api/personal-memory/${id}`, { method: "DELETE" });
  await parseJson(response);
}

export async function approvePersonalMemoryCandidate(
  id: string,
  scope: "global" | "automation" | "once" = "global",
  automationId?: string,
): Promise<PersonalMemoryRecord> {
  const response = await fetch(`/api/personal-memory/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, automationId }),
  });
  const payload = await parseJson<{ memory: PersonalMemoryRecord }>(response);
  return payload.memory;
}

export async function rejectPersonalMemoryCandidate(
  id: string,
): Promise<PersonalMemoryRecord> {
  const response = await fetch(`/api/personal-memory/${id}/reject`, {
    method: "POST",
  });
  const payload = await parseJson<{ memory: PersonalMemoryRecord }>(response);
  return payload.memory;
}

export async function updatePersonalMemorySettingsClient(
  patch: Partial<PersonalMemorySettings> & { onDisable?: "keep" | "wipe" },
): Promise<PersonalMemorySettings> {
  const response = await fetch("/api/personal-memory/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = await parseJson<{ settings: PersonalMemorySettings }>(response);
  return payload.settings;
}

export async function exportPersonalMemoriesClient(): Promise<unknown> {
  const response = await fetch("/api/personal-memory/export", { cache: "no-store" });
  return parseJson(response);
}

export async function deleteAllPersonalMemoriesClient(): Promise<void> {
  const response = await fetch("/api/personal-memory/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete_all" }),
  });
  await parseJson(response);
}

export async function pauseAllPersonalMemoriesClient(): Promise<void> {
  const response = await fetch("/api/personal-memory/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause_all" }),
  });
  await parseJson(response);
}

export async function decidePersonalMemoryCandidate(
  id: string,
  decision: CandidateDecision,
  automationId?: string,
): Promise<PersonalMemoryRecord> {
  const response = await fetch(`/api/personal-memory/${id}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, automationId }),
  });
  const payload = await parseJson<{ memory: PersonalMemoryRecord }>(response);
  return payload.memory;
}

export async function learnDeliverableDiffClient(input: {
  before: string;
  after: string;
  automationId?: string;
  artifactType?: string;
  workCategory?: string;
  companyId?: string;
  templateId?: string;
}): Promise<PersonalMemoryRecord[]> {
  const response = await fetch("/api/personal-memory/learn-diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ memories: PersonalMemoryRecord[] }>(response);
  return payload.memories;
}

export async function fetchMemoryImprovementSuggestions(): Promise<
  MemoryImprovementSuggestion[]
> {
  const response = await fetch("/api/personal-memory/suggestions", {
    cache: "no-store",
  });
  const payload = await parseJson<{ suggestions: MemoryImprovementSuggestion[] }>(
    response,
  );
  return payload.suggestions;
}

export async function fetchMemoryApplyPreview(input?: {
  notes?: string;
  workCategory?: string;
  companyId?: string;
  automationId?: string;
}): Promise<MemoryApplyPreviewItem[]> {
  const response = await fetch("/api/personal-memory/apply-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  const payload = await parseJson<{ items: MemoryApplyPreviewItem[] }>(response);
  return payload.items;
}

export async function disableMemoryForThisRunClient(id: string): Promise<void> {
  const response = await fetch(`/api/personal-memory/${id}/session-disable`, {
    method: "POST",
  });
  await parseJson(response);
}

export async function fetchMemoryQualityDashboard(): Promise<MemoryQualityDashboard> {
  const response = await fetch("/api/personal-memory/quality", {
    cache: "no-store",
  });
  const payload = await parseJson<{ dashboard: MemoryQualityDashboard }>(response);
  return payload.dashboard;
}

export async function evaluateDeliverableQualityClient(input: {
  before: string;
  after: string;
  automationId?: string;
  artifactType?: string;
  workCategory?: string;
  companyId?: string;
  templateId?: string;
}): Promise<{
  memories: PersonalMemoryRecord[];
  evaluation: DeliverableQualityEvaluation;
}> {
  const response = await fetch("/api/personal-memory/quality", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(response);
}
