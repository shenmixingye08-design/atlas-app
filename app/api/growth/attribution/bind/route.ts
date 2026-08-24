import { auth, currentUser } from "@clerk/nextjs/server";

import { observeSignupBind } from "@/lib/owner/revenue-agent/observe";
import { readVisitorIdFromCookie } from "@/lib/owner/revenue-agent/visitor-cookie";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const visitorId = await readVisitorIdFromCookie();
  const result = await observeSignupBind({
    userId,
    visitorId,
    clerkCreatedAtMs: user?.createdAt ?? null,
  });

  return Response.json({
    ok: true,
    attributed: result.attributed,
    reason: result.reason ?? null,
  });
}
