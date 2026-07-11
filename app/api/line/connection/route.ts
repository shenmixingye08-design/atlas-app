import { auth } from "@clerk/nextjs/server";

import {
  disconnectLineForUser,
  getLineBotBasicId,
  getLineConnectionStatus,
  getLineLinkByAtlasUserId,
  issueLineLinkCodeForUser,
  pushLineTextMessage,
} from "@/lib/integrations/line";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/notifications/service";

function connectionPayload(userId: string) {
  return {
    ...getLineConnectionStatus(userId),
    botBasicId: getLineBotBasicId(),
  };
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  return Response.json(connectionPayload(userId));
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    enabled?: boolean;
  } | null;

  if (body?.action === "set_enabled" && typeof body.enabled === "boolean") {
    const current = getUserNotificationPreferences(userId);
    updateUserNotificationPreferences(userId, {
      channels: { ...current.channels, line: body.enabled },
    });
    return Response.json(connectionPayload(userId));
  }

  if (body?.action === "issue_code") {
    const linkCode = issueLineLinkCodeForUser(userId);
    const current = getUserNotificationPreferences(userId);
    if (!current.channels.line) {
      updateUserNotificationPreferences(userId, {
        channels: { ...current.channels, line: true },
      });
    }
    return Response.json({
      ...connectionPayload(userId),
      linkCode,
    });
  }

  if (body?.action === "disconnect") {
    disconnectLineForUser(userId);
    const current = getUserNotificationPreferences(userId);
    updateUserNotificationPreferences(userId, {
      channels: { ...current.channels, line: false },
    });
    return Response.json(connectionPayload(userId));
  }

  if (body?.action === "test") {
    const prefs = getUserNotificationPreferences(userId);
    if (!prefs.allEnabled || !prefs.channels.line) {
      return Response.json(
        { message: "LINE通知がOFFです。設定でONにしてください。" },
        { status: 409 },
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
        ...connectionPayload(userId),
        testSent: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "テスト通知の送信に失敗しました";
      return Response.json({ message }, { status: 500 });
    }
  }

  return Response.json({ message: "Unknown action" }, { status: 400 });
}
