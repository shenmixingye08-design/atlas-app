import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { DIAGNOSIS_COOKIE } from "@/lib/growth/acquisition/constants";
import { observeSignupBind } from "@/lib/owner/revenue-agent/observe";
import { readVisitorIdFromCookie } from "@/lib/owner/revenue-agent/visitor-cookie";

export const dynamic = "force-dynamic";

function readDiagnosisSessionId(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sessionId?: unknown };
    return typeof parsed.sessionId === "string" ? parsed.sessionId : null;
  } catch {
    return null;
  }
}

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

  const cookieStore = await cookies();
  const sessionId = readDiagnosisSessionId(cookieStore.get(DIAGNOSIS_COOKIE)?.value);
  const { bindDiagnosisToUser } = await import("@/lib/growth/acquisition/service");
  const diagnosis = await bindDiagnosisToUser({ userId, visitorId, sessionId });
  const { bindOfferToUser } = await import("@/lib/growth/first-revenue/service");
  await bindOfferToUser({ userId, visitorId });

  return Response.json({
    ok: true,
    attributed: result.attributed,
    reason: result.reason ?? null,
    diagnosisBound: Boolean(diagnosis),
  });
}
