import { auth } from "@clerk/nextjs/server";

import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";
import { deactivateWorkMemory } from "@/lib/work-memory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await ensureWorkMemoryHydrated(userId);
  const memory = deactivateWorkMemory(userId, id);
  if (!memory) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ memory });
}
