import { auth } from "@clerk/nextjs/server";

import { rejectWorkMemoryCandidate } from "@/lib/work-memory/service";

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
  const rejected = rejectWorkMemoryCandidate(userId, id);
  if (!rejected) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
