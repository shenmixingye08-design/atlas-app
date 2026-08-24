import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { auditRequestContext, recordAuditLogSafe } from "@/lib/owner/audit-log";
import { generateRevenuePlans } from "@/lib/owner/revenue-agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mode: "daily" | "force" = "daily";
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (body.mode === "force" || body.mode === "daily") mode = body.mode;
  } catch {
    mode = "daily";
  }

  try {
    const result = await generateRevenuePlans({ mode });
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      email: owner.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: "revenue-agent-generate",
      result: "success",
      reason: `generate ${mode} created=${result.created} skipped=${result.skipped}`,
    });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "企画生成に失敗しました";
    return Response.json({ error: message }, { status: 400 });
  }
}
