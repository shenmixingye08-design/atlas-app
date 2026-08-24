import { auth } from "@clerk/nextjs/server";

import { getRevenueMaxSnapshot } from "@/lib/growth/revenue-max/service";
import { canAskForStory, submitStory } from "@/lib/growth/acquisition/service";
import type { StoryConsent } from "@/lib/growth/acquisition/types";

export const dynamic = "force-dynamic";

const CONSENTS: StoryConsent[] = ["ops_only", "anonymous_ok", "named_ok", "do_not_publish"];

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const snapshot = await getRevenueMaxSnapshot(userId);
  if (!canAskForStory(snapshot.state)) {
    return Response.json({ error: "事例の依頼条件を満たしていません" }, { status: 400 });
  }
  const consent = CONSENTS.includes(body.consent as StoryConsent)
    ? (body.consent as StoryConsent)
    : "ops_only";
  const result = await submitStory({
    userId,
    usedFor: String(body.usedFor ?? "").slice(0, 200),
    helpful: String(body.helpful ?? "").slice(0, 200),
    improve: String(body.improve ?? "").slice(0, 200),
    consent,
    firstSuccessAt: snapshot.state.firstSuccessAt,
    state: snapshot.state,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, published: false });
}
