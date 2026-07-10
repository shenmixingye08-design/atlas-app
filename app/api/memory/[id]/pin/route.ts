import { auth } from "@clerk/nextjs/server";

import { toggleUserMemoryPin } from "@/lib/user-memory/service";

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
  const memory = toggleUserMemoryPin(userId, id);
  if (!memory) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ memory });
}
