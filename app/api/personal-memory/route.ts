import { auth } from "@clerk/nextjs/server";

import {
  createPersonalMemory,
  getPersonalMemorySettings,
  listPersonalMemories,
} from "@/lib/personal-memory/service";
import type {
  CreatePersonalMemoryInput,
  MemoryStatus,
} from "@/lib/personal-memory/types";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = new URL(request.url).searchParams.get("status") as
    | MemoryStatus
    | "all"
    | null;
  const memories = await listPersonalMemories(
    userId,
    status ? { status } : undefined,
  );
  const settings = await getPersonalMemorySettings(userId);
  return Response.json({ memories, settings });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as CreatePersonalMemoryInput;
    const memory = await createPersonalMemory(userId, {
      ...body,
      source: body.source ?? "explicit",
      status: body.status ?? "active",
    });
    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    const message = clientSafeMessage(error, "create_failed");
    return Response.json({ error: message }, { status: 400 });
  }
}
