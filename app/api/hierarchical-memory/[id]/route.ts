import { auth } from "@clerk/nextjs/server";

import {
  deleteHierarchicalMemory,
  hydrateHierarchicalMemory,
  updateHierarchicalMemory,
  type MemoryScope,
  type MemoryStatus,
} from "@/lib/hierarchical-memory";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  await hydrateHierarchicalMemory(userId);
  const patch = body as {
    value?: string;
    scope?: MemoryScope;
    status?: MemoryStatus;
    isTemporary?: boolean;
    category?: string;
    key?: string;
  };

  try {
    const updated = updateHierarchicalMemory(userId, id, patch);
    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ memory: updated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  await hydrateHierarchicalMemory(userId);
  const ok = deleteHierarchicalMemory(userId, id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
