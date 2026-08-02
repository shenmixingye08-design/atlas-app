import { auth } from "@clerk/nextjs/server";

import { decideCandidate } from "@/lib/personal-memory/service";
import type { CandidateDecision } from "@/lib/personal-memory/types";

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
    const body = (await request.json()) as {
      decision?: CandidateDecision;
      automationId?: string;
    };
    if (
      body.decision !== "always" &&
      body.decision !== "once" &&
      body.decision !== "never"
    ) {
      return Response.json({ error: "invalid_decision" }, { status: 400 });
    }
    const memory = await decideCandidate(userId, id, body.decision, {
      automationId: body.automationId,
    });
    return Response.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "decide_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
