import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { auditRequestContext, recordAuditLogSafe } from "@/lib/owner/audit-log";
import {
  getRevenueAgentSnapshot,
  parseFunnelRange,
  parseGoalsPatch,
  updateAdSpendYen,
  updateRevenueGoals,
} from "@/lib/owner/revenue-agent";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const range = parseFunnelRange(new URL(request.url).searchParams.get("range"));
  return Response.json(await getRevenueAgentSnapshot(userId, range));
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

  const raw = body as Record<string, unknown>;
  if (raw.adSpendYen === null || typeof raw.adSpendYen === "number") {
    try {
      await updateAdSpendYen(raw.adSpendYen === null ? null : raw.adSpendYen);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "広告費を保存できません";
      return Response.json({ error: message }, { status: 400 });
    }
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
