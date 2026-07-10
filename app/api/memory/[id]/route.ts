import { auth } from "@clerk/nextjs/server";

import {
  deleteUserMemory,
  updateUserMemory,
} from "@/lib/user-memory/service";
import type { UpdateMemoryInput } from "@/lib/user-memory/types";

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

  let body: UpdateMemoryInput;
  try {
    body = (await request.json()) as UpdateMemoryInput;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const memory = updateUserMemory(userId, id, body);
  if (!memory) {
    return Response.json({ error: "Not found" }, { status: 404 });
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
  const deleted = deleteUserMemory(userId, id);
  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
