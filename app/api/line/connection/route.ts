import { auth } from "@clerk/nextjs/server";

import {
  disconnectLineForUser,
  getLineBotBasicId,
  getLineConnectionStatus,
  getLineLinkByAtlasUserId,
  issueLineLinkCodeForUser,
  isInvalidLineAccessTokenError,
  LineApiError,
  pushLineTextMessage,
} from "@/lib/integrations/line";
import { ensureLineLinkHydrated } from "@/lib/integrations/line/link-durable";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/notifications/service";
import { ensureNotificationsHydrated } from "@/lib/notifications/durable";

async function connectionPayload(userId: string) {
  return {
    ...(await getLineConnectionStatus(userId)),
    botBasicId: getLineBotBasicId(),
  };
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await connectionPayload(userId));
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  await ensureNotificationsHydrated(userId);
  await ensureLineLinkHydrated(userId);

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    enabled?: boolean;
  } | null;

  if (body?.action === "set_enabled" && typeof body.enabled === "boolean") {
    const current = getUserNotificationPreferences(userId);
    updateUserNotificationPreferences(userId, {
      channels: { ...current.channels, line: body.enabled },
    });
    return Response.json(await connectionPayload(userId));
  }

  if (body?.action === "issue_code") {
    const linkCode = await issueLineLinkCodeForUser(userId);
    const current = getUserNotificationPreferences(userId);
    if (!current.channels.line) {
      updateUserNotificationPreferences(userId, {
        channels: { ...current.channels, line: true },
      });
    }
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "integration",
      action: "line_connect",
      targetId: "line",
      result: "success",
      reason: "LINE link code issued",
    });
    return Response.json({
      ...(await connectionPayload(userId)),
      linkCode,
    });
  }

  if (body?.action === "disconnect") {
    await disconnectLineForUser(userId);
    const current = getUserNotificationPreferences(userId);
    updateUserNotificationPreferences(userId, {
      channels: { ...current.channels, line: false },
    });
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "integration",
      action: "line_disconnect",
      targetId: "line",
      result: "success",
      reason: "LINE disconnected",
    });
    return Response.json(await connectionPayload(userId));
  }

  if (body?.action === "test") {
    const prefs = getUserNotificationPreferences(userId);
    if (!prefs.allEnabled || !prefs.channels.line) {
      return Response.json(
        { message: "LINE通知がOFFです。設定でONにしてください。" },
        { status: 409 },
      );
    }
    const status = await getLineConnectionStatus(userId);
    if (!status.configured) {
      return Response.json(
        { message: "LINE Messaging APIがサーバーに未設定です。" },
        { status: 503 },
      );
    }
    const link = getLineLinkByAtlasUserId(userId);
    if (!link) {
      return Response.json(
        { message: "LINEアカウントが未連携です。" },
        { status: 409 },
      );
    }
    try {
      await pushLineTextMessage({
        lineUserId: link.lineUserId,
        text: "【ATLAS】テスト通知です。LINE通知の接続は正常です。",
      });
      return Response.json({
        ...(await connectionPayload(userId)),
        testSent: true,
      });
    } catch (error) {
      if (isInvalidLineAccessTokenError(error)) {
        return Response.json(
          {
            message:
              "LINEのアクセストークンが無効です。サーバーの LINE_CHANNEL_ACCESS_TOKEN を確認してください。",
          },
          { status: 502 },
        );
      }
      const message =
        error instanceof LineApiError
          ? "LINEへの送信に失敗しました。しばらくしてから再度お試しください。"
          : error instanceof Error
            ? error.message
            : "テスト通知の送信に失敗しました";
      return Response.json({ message }, { status: 502 });
    }
  }

  return Response.json({ message: "Unknown action" }, { status: 400 });
}
