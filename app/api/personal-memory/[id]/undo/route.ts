import { auth } from "@clerk/nextjs/server";
import { undoPersonalMemoryChange } from "@/lib/personal-memory/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const restored = await undoPersonalMemoryChange(userId, id);
  if (!restored) {
    return Response.json({ error: "Undo snapshot not found" }, { status: 404 });
  }
  return Response.json({ memory: restored });
}
