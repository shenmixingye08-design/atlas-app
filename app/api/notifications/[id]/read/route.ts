import { auth } from "@clerk/nextjs/server";

import { markNotificationRead } from "@/lib/notifications/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const record = markNotificationRead(id, userId);
  if (!record) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(record);
}
