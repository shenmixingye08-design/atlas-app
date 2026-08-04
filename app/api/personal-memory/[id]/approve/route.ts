import { auth } from "@clerk/nextjs/server";

import { approveCandidate } from "@/lib/personal-memory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    let scope: "global" | "automation" | "once" = "global";
    let automationId: string | undefined;
    try {
      const body = (await request.json()) as {
        scope?: "global" | "automation" | "once";
        automationId?: string;
      };
      if (body.scope) scope = body.scope;
      automationId = body.automationId;
    } catch {
      // empty body ok
    }
    const memory = await approveCandidate(userId, id, { scope, automationId });
    return Response.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "approve_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
