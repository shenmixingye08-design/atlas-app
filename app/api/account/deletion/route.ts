import { auth } from "@clerk/nextjs/server";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  cancelAccountDeletion,
  getAccountDeletionStatus,
  purgeAccount,
  requestAccountWithdrawal,
} from "@/lib/account-deletion";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await getAccountDeletionStatus(userId);
  return Response.json({ record });
}

type Body = {
  action?: unknown;
  confirmation?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  try {
    if (action === "withdraw") {
      const record = await requestAccountWithdrawal(userId);
      const { recordAuditLogSafe, auditRequestContext } = await import(
        "@/lib/owner/audit-log"
      );
      const ctx = auditRequestContext(request);
      recordAuditLogSafe({
        userId,
        email: record.email,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        category: "account",
        action: "account_withdraw",
        targetId: userId,
        result: "success",
        reason: `deleteAfter=${record.deleteAfter}`,
      });
      return Response.json({ record });
    }

    if (action === "cancel") {
      const record = await cancelAccountDeletion(userId);
      const { recordAuditLogSafe, auditRequestContext } = await import(
        "@/lib/owner/audit-log"
      );
      const ctx = auditRequestContext(request);
      recordAuditLogSafe({
        userId,
        email: record?.email ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        category: "account",
        action: "account_cancel_deletion",
        targetId: userId,
        result: "success",
        reason: "deletion cancelled",
      });
      return Response.json({ record });
    }

    if (action === "purge") {
      const confirmation =
        typeof body.confirmation === "string" ? body.confirmation : "";
      if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
        const { recordAuditLogSafe, auditRequestContext } = await import(
          "@/lib/owner/audit-log"
        );
        const ctx = auditRequestContext(request);
        recordAuditLogSafe({
          userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          category: "account",
          action: "account_purge",
          targetId: userId,
          result: "failure",
          reason: "confirmation mismatch",
        });
        return Response.json(
          { error: '確認のため "DELETE" と入力してください' },
          { status: 400 },
        );
      }
      const record = await purgeAccount(userId, confirmation);
      const { recordAuditLogSafe, auditRequestContext } = await import(
        "@/lib/owner/audit-log"
      );
      const ctx = auditRequestContext(request);
      recordAuditLogSafe({
        userId,
        email: record.email,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        category: "account",
        action: "account_purge",
        targetId: userId,
        result: "success",
        reason: "account purged",
      });
      return Response.json({ record });
    }

    return Response.json(
      { error: "action must be withdraw, cancel, or purge" },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Account deletion failed";
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "account",
      action:
        action === "withdraw"
          ? "account_withdraw"
          : action === "cancel"
            ? "account_cancel_deletion"
            : action === "purge"
              ? "account_purge"
              : "account_withdraw",
      targetId: userId,
      result: "failure",
      reason: message,
    });
    return Response.json({ error: message }, { status: 400 });
  }
}
