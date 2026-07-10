import { auth } from "@clerk/nextjs/server";

import {
  deactivateWorkMemory,
  deleteWorkMemory,
  getWorkMemory,
  updateWorkMemory,
} from "@/lib/work-memory/service";
import type { UpdateWorkMemoryInput } from "@/lib/work-memory/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const memory = getWorkMemory(userId, id);
  if (!memory) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ memory });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: UpdateWorkMemoryInput;
  try {
    body = (await request.json()) as UpdateWorkMemoryInput;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const memory = updateWorkMemory(userId, id, body);
  if (!memory) {
    return Response.json({ error: "Not found or invalid content" }, { status: 404 });
  }

  return Response.json({ memory });
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
  const deleted = deleteWorkMemory(userId, id);
  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
