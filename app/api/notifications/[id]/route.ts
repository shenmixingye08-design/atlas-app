import { auth } from "@clerk/nextjs/server";

import { removeUserNotification } from "@/lib/notifications/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const removed = removeUserNotification(id, userId);
  if (!removed) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
