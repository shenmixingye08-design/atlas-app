import type { KnowledgeEntry } from "./types";

export async function fetchKnowledgeEntries(): Promise<{
  entries: KnowledgeEntry[];
  total: number;
}> {
  const response = await fetch("/api/knowledge", { cache: "no-store" });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load knowledge");
  }

  return response.json() as Promise<{ entries: KnowledgeEntry[]; total: number }>;
}
