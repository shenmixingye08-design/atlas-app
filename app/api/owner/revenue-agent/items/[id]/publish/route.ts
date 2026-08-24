import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { auditRequestContext, recordAuditLogSafe } from "@/lib/owner/audit-log";
import { publishRevenueItem } from "@/lib/owner/revenue-agent";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  try {
    const item = await publishRevenueItem(id, userId);
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      email: owner.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: id,
      result: item.status === "published" ? "success" : "failure",
      reason: item.status === "published"
        ? `x published ${item.xTweetId}`
        : item.lastError ?? "publish failed",
    });
    return Response.json({ item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "投稿に失敗しました";
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      email: owner.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: id,
      result: "failure",
      reason: message,
    });
    return Response.json({ error: message }, { status: 400 });
  }
}
