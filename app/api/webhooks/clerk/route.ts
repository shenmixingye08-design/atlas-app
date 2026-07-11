import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";

import { recordAuditLogSafe } from "@/lib/owner/audit-log";

/**
 * Clerk session lifecycle → audit log (login / logout).
 * Configure CLERK_WEBHOOK_SECRET and subscribe to session.created / session.ended.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const event = await verifyWebhook(request);
    const type = event.type;

    if (type === "session.created") {
      const data = event.data as {
        user_id?: string;
        id?: string;
      };
      recordAuditLogSafe({
        userId: data.user_id ?? null,
        category: "auth",
        action: "login",
        targetId: data.id ?? null,
        result: "success",
        reason: "Clerk session.created",
      });
      return Response.json({ ok: true });
    }

    if (type === "session.ended" || type === "session.removed") {
      const data = event.data as {
        user_id?: string;
        id?: string;
      };
      recordAuditLogSafe({
        userId: data.user_id ?? null,
        category: "auth",
        action: "logout",
        targetId: data.id ?? null,
        result: "success",
        reason: `Clerk ${type}`,
      });
      return Response.json({ ok: true });
    }

    return Response.json({ ok: true, skipped: true });
  } catch (error) {
    console.error("[clerk webhook]", error);
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
