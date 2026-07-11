import { auth, currentUser } from "@clerk/nextjs/server";

import {
  auditRequestContext,
  recordAuditLog,
} from "@/lib/owner/audit-log";
import type { AuditActionName, AuditCategory } from "@/lib/owner/audit-log/types";

/**
 * Minimal authenticated client events that cannot be observed server-side
 * (local data export download, optional logout beacon).
 */
const ALLOWED: Record<
  string,
  { category: AuditCategory; action: AuditActionName }
> = {
  data_export: { category: "data", action: "data_export" },
  request_delete: { category: "request", action: "request_delete" },
  logout: { category: "auth", action: "logout" },
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action?: unknown;
    targetId?: unknown;
    result?: unknown;
    reason?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const actionKey = typeof body.action === "string" ? body.action : "";
  const mapped = ALLOWED[actionKey];
  if (!mapped) {
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;
  const ctx = auditRequestContext(request);

  const entry = await recordAuditLog({
    userId,
    email,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: mapped.category,
    action: mapped.action,
    targetId: typeof body.targetId === "string" ? body.targetId : null,
    result: body.result === "failure" ? "failure" : "success",
    reason: typeof body.reason === "string" ? body.reason : null,
  });

  return Response.json({ id: entry.id });
}
