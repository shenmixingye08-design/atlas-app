import { auth } from "@clerk/nextjs/server";

import {
  deleteAllPersonalMemories,
  pauseAllPersonalMemories,
} from "@/lib/personal-memory/service";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action === "delete_all") {
      const count = await deleteAllPersonalMemories(userId);
      return Response.json({ ok: true, count });
    }
    if (body.action === "pause_all") {
      const count = await pauseAllPersonalMemories(userId);
      return Response.json({ ok: true, count });
    }
    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "bulk_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
