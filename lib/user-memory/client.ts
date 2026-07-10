import type {
  CreateMemoryInput,
  MemoryListResponse,
  MemoryResetInput,
  UpdateMemoryInput,
  UserMemory,
} from "./types";

export async function fetchUserMemories(): Promise<MemoryListResponse> {
  const response = await fetch("/api/memory", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load memories");
  }
  return response.json() as Promise<MemoryListResponse>;
}

export async function createUserMemoryClient(
  input: CreateMemoryInput,
): Promise<UserMemory> {
  const response = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to create memory");
  const payload = (await response.json()) as { memory: UserMemory };
  return payload.memory;
}

export async function updateUserMemoryClient(
  memoryId: string,
  patch: UpdateMemoryInput,
): Promise<UserMemory> {
  const response = await fetch(`/api/memory/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Failed to update memory");
  const payload = (await response.json()) as { memory: UserMemory };
  return payload.memory;
}

export async function deleteUserMemoryClient(memoryId: string): Promise<void> {
  const response = await fetch(`/api/memory/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete memory");
}

export async function toggleUserMemoryPinClient(
  memoryId: string,
): Promise<UserMemory> {
  const response = await fetch(
    `/api/memory/${encodeURIComponent(memoryId)}/pin`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Failed to toggle pin");
  const payload = (await response.json()) as { memory: UserMemory };
  return payload.memory;
}

export async function resetUserMemoriesClient(
  input: MemoryResetInput,
): Promise<{ deleted: number }> {
  const response = await fetch("/api/memory/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to reset memories");
  return response.json() as Promise<{ deleted: number }>;
}

export async function syncProfileToMemoryClient(profile: {
  frequentlyUsedJobs: Array<{ jobCategory: string; label: string; count: number }>;
  jobSettings: Record<string, unknown>;
  manualOverrides: Array<{ label: string; summary: string; jobCategory: string }>;
}): Promise<void> {
  await fetch("/api/memory/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function queueProfileMemorySync(profile: {
  frequentlyUsedJobs: Array<{ jobCategory: string; label: string; count: number }>;
  jobSettings: Record<string, unknown>;
  manualOverrides: Array<{ label: string; summary: string; jobCategory: string }>;
}): void {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void syncProfileToMemoryClient(profile).catch(() => {
      /* ignore sync errors */
    });
  }, 800);
}
