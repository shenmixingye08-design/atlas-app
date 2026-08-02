import { auth } from "@clerk/nextjs/server";

import { disableMemoryForThisRun } from "@/lib/personal-memory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await disableMemoryForThisRun(userId, id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "disable_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
