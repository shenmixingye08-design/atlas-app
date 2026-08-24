import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { auditRequestContext, recordAuditLogSafe } from "@/lib/owner/audit-log";
import {
  getRevenueAgentSnapshot,
  parseGoalsPatch,
  updateRevenueGoals,
} from "@/lib/owner/revenue-agent";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await getRevenueAgentSnapshot(userId));
}

export async function PATCH(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseGoalsPatch(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const goals = await updateRevenueGoals(parsed);
  const { userId } = await auth();
  const ctx = auditRequestContext(request);
  recordAuditLogSafe({
    userId: userId ?? null,
    email: owner.email,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: "owner",
    action: "owner_action",
    targetId: "revenue-agent-goals",
    result: "success",
    reason: "revenue agent goals updated",
  });
  return Response.json({ goals });
}
