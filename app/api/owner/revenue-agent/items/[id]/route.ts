import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { auditRequestContext, recordAuditLogSafe } from "@/lib/owner/audit-log";
import {
  editRevenueItem,
  regenerateRevenueItem,
  transitionRevenueItem,
  updateRevenueMetrics,
} from "@/lib/owner/revenue-agent";
import type { RevenueMetrics } from "@/lib/owner/revenue-agent/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const { id } = await context.params;
  const { userId } = await auth();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "edit";

  try {
    const item =
      action === "edit"
        ? await editRevenueItem(id, {
            title: typeof body.title === "string" ? body.title : undefined,
            hook: typeof body.hook === "string" ? body.hook : undefined,
            body: typeof body.body === "string" ? body.body : undefined,
            cta: typeof body.cta === "string" ? body.cta : undefined,
            scheduledAt:
              typeof body.scheduledAt === "string" || body.scheduledAt === null
                ? (body.scheduledAt as string | null)
                : undefined,
          })
        : action === "regenerate"
          ? await regenerateRevenueItem(id)
          : action === "metrics"
            ? await updateRevenueMetrics(
                id,
                (body.metrics ?? {}) as Partial<RevenueMetrics>,
              )
            : await transitionRevenueItem(
                id,
                action as
                  | "approve"
                  | "reject"
                  | "schedule"
                  | "mark_published"
                  | "retry"
                  | "submit",
                {
                  scheduledAt:
                    typeof body.scheduledAt === "string"
                      ? body.scheduledAt
                      : undefined,
                },
              );

    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId: userId ?? null,
      email: owner.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: id,
      result: "success",
      reason: `revenue-agent ${action}`,
    });
    return Response.json({ item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "更新に失敗しました";
    return Response.json({ error: message }, { status: 400 });
  }
}
