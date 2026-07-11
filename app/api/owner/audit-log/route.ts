import {
  listOwnerAuditLogs,
  auditLogsToCsv,
  parseAuditLogQuery,
  updateAuditRetention,
  isAuditRetentionDays,
  pruneExpiredAuditLogs,
  recordAuditLogSafe,
  auditRequestContext,
} from "@/lib/owner/audit-log";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();

  const url = new URL(request.url);
  const query = parseAuditLogQuery(url.searchParams);
  const format = url.searchParams.get("format");

  const snapshot = await listOwnerAuditLogs(query);

  if (format === "csv") {
    const csv = auditLogsToCsv(snapshot.entries);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="atlas-audit-log.csv"`,
      },
    });
  }

  return Response.json(snapshot);
}

export async function POST(request: Request): Promise<Response> {
  const owner = await requireAtlasOwner();
  const { userId } = await auth();
  const ctx = auditRequestContext(request);

  let body: {
    action?: unknown;
    retentionDays?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "set_retention") {
    if (!isAuditRetentionDays(body.retentionDays)) {
      return Response.json(
        { error: "retentionDays must be 30, 90, or 365" },
        { status: 400 },
      );
    }
    const settings = await updateAuditRetention(body.retentionDays);
    recordAuditLogSafe({
      userId: userId ?? null,
      email: owner.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: `retention:${body.retentionDays}`,
      result: "success",
      reason: `保持期間を ${body.retentionDays} 日に変更`,
    });
    return Response.json({ settings });
  }

  if (body.action === "prune") {
    const result = await pruneExpiredAuditLogs();
    recordAuditLogSafe({
      userId: userId ?? null,
      email: owner.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: "audit_prune",
      result: "success",
      reason: `期限切れ監査ログを ${result.pruned} 件削除`,
    });
    return Response.json(result);
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
