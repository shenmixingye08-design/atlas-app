import { auth } from "@clerk/nextjs/server";

import {
  hydrateHierarchicalMemory,
  listHierarchicalMemories,
  saveHierarchicalMemory,
  type MemoryScope,
  type SaveCandidate,
} from "@/lib/hierarchical-memory";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await hydrateHierarchicalMemory(userId);
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") ?? "all") as MemoryScope | "all";
  const memories = listHierarchicalMemories(userId, { scope });
  return Response.json({ memories });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const record = body as Partial<SaveCandidate>;
  if (
    typeof record.scope !== "string" ||
    typeof record.key !== "string" ||
    typeof record.value !== "string" ||
    typeof record.category !== "string"
  ) {
    return Response.json({ error: "scope/key/value/category required" }, { status: 400 });
  }

  try {
    await hydrateHierarchicalMemory(userId);
    const saved = saveHierarchicalMemory(userId, {
      scope: record.scope as MemoryScope,
      key: record.key,
      value: record.value,
      category: record.category,
      source: record.source ?? "explicit_user_instruction",
      confidence: typeof record.confidence === "number" ? record.confidence : 0.9,
      isTemporary: Boolean(record.isTemporary),
      expiresAt: record.expiresAt ?? null,
      projectId: record.projectId ?? null,
      jobId: record.jobId ?? null,
      automationId: record.automationId ?? null,
    });
    return Response.json({ memory: saved }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 400 },
    );
  }
}
