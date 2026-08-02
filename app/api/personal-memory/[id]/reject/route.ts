import { auth } from "@clerk/nextjs/server";

import { rejectCandidate } from "@/lib/personal-memory/service";

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
    const memory = await rejectCandidate(userId, id);
    return Response.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "reject_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
