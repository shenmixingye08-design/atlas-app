import { auth } from "@clerk/nextjs/server";

import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";
import {
  createWorkMemory,
  listWorkMemories,
} from "@/lib/work-memory/service";
import type {
  CreateWorkMemoryInput,
  WorkMemoryType,
} from "@/lib/work-memory/types";
import { WORK_MEMORY_TYPES } from "@/lib/work-memory/types";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureWorkMemoryHydrated(userId);

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const typeParam = url.searchParams.get("type");
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  const type =
    typeParam && WORK_MEMORY_TYPES.includes(typeParam as WorkMemoryType)
      ? (typeParam as WorkMemoryType)
      : "all";

  return Response.json(
    listWorkMemories(userId, { query, type, activeOnly }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureWorkMemoryHydrated(userId);

  let body: CreateWorkMemoryInput;
  try {
    body = (await request.json()) as CreateWorkMemoryInput;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title?.trim() || !body.summary?.trim() || !body.type) {
    return Response.json(
      { error: "title, summary, and type are required" },
      { status: 400 },
    );
  }

  if (!WORK_MEMORY_TYPES.includes(body.type)) {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  const memory = createWorkMemory(userId, {
    ...body,
    title: body.title.trim(),
    summary: body.summary.trim(),
    isUserConfirmed: body.isUserConfirmed ?? true,
  });

  if (!memory) {
    return Response.json(
      { error: "Memory content could not be saved (sensitive or invalid)" },
      { status: 422 },
    );
  }

  return Response.json({ memory }, { status: 201 });
}
