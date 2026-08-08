import { auth } from "@clerk/nextjs/server";

import {
  deletePersonalMemory,
  getPersonalMemory,
  updatePersonalMemory,
} from "@/lib/personal-memory/service";
import type { UpdatePersonalMemoryInput } from "@/lib/personal-memory/types";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const memory = await getPersonalMemory(userId, id);
    return Response.json({ memory });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as UpdatePersonalMemoryInput;
    const memory = await updatePersonalMemory(userId, id, body);
    return Response.json({ memory });
  } catch (error) {
    const message = clientSafeMessage(error, "update_failed");
    const status = message === "MEMORY_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await deletePersonalMemory(userId, id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
