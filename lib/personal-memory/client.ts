import type {
  CreatePersonalMemoryInput,
  MemoryStatus,
  PersonalMemoryRecord,
  PersonalMemorySettings,
  UpdatePersonalMemoryInput,
} from "@/lib/personal-memory/types";

function formatMemoryActionError(
  payload: { error?: string; retryHint?: string; diagnosticId?: string } | null,
  fallback: string,
  status: number,
): string {
  const base = payload?.error?.trim() || fallback;
  const retry =
    payload?.retryHint?.trim() ||
    (status === 404
      ? "画面を再読み込みしてから、もう一度お試しください。"
      : status >= 500
        ? "数秒待ってから、もう一度お試しください。"
        : "");
  const diagnosticId = payload?.diagnosticId?.trim();
  const withRetry = retry && !base.includes(retry) ? `${base} ${retry}` : base;
  if (diagnosticId && !withRetry.includes(diagnosticId)) {
    return `${withRetry}（診断ID: ${diagnosticId}）`;
  }
  return withRetry;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; retryHint?: string; diagnosticId?: string })
    | null;
  if (!response.ok) {
    throw new Error(
      formatMemoryActionError(payload, "記憶の操作に失敗しました", response.status),
    );
  }
  if (!payload) {
    throw new Error("記憶の操作に失敗しました");
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
