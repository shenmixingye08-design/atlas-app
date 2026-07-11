import "server-only";

import type { LineNotifyEvent } from "@/lib/notifications/types";
import { getStoredPreferences } from "@/lib/notifications/store";

import {
  createLineLinkCode,
  getLineLinkByAtlasUserId,
  saveLineUserLink,
  unlinkLineUser,
  consumeLineLinkCode,
} from "./link-store";
import { isLineMessagingConfigured } from "./config";
import { pushLineTextMessage, replyLineTextMessage } from "./messaging";

export function formatLineNotificationText(input: {
  title: string;
  message: string;
  actionUrl?: string | null;
}): string {
  const lines = [`【ATLAS】${input.title}`, input.message];
  if (input.actionUrl) {
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
    if (origin) {
      lines.push("", `${origin}${input.actionUrl}`);
    }
  }
  return lines.join("\n");
}

export function isLineEventEnabled(
  userId: string,
  event: LineNotifyEvent,
): boolean {
  const prefs = getStoredPreferences(userId);
  if (!prefs.allEnabled || !prefs.channels.line) return false;
  return Boolean(prefs.lineEvents?.[event]);
}

export async function dispatchLineNotification(input: {
  userId: string;
  event: LineNotifyEvent;
  title: string;
  message: string;
  actionUrl?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!isLineMessagingConfigured()) {
    return { sent: false, reason: "not_configured" };
  }

  if (!isLineEventEnabled(input.userId, input.event)) {
    return { sent: false, reason: "disabled" };
  }

  const link = getLineLinkByAtlasUserId(input.userId);
  if (!link) {
    return { sent: false, reason: "not_linked" };
  }

  await pushLineTextMessage({
    lineUserId: link.lineUserId,
    text: formatLineNotificationText(input),
  });

  return { sent: true };
}

export function getLineConnectionStatus(userId: string): {
  configured: boolean;
  linked: boolean;
  displayName: string | null;
  lineEnabled: boolean;
} {
  const prefs = getStoredPreferences(userId);
  const link = getLineLinkByAtlasUserId(userId);
  return {
    configured: isLineMessagingConfigured(),
    linked: Boolean(link),
    displayName: link?.displayName ?? null,
    lineEnabled: prefs.channels.line,
  };
}

export function issueLineLinkCodeForUser(userId: string): {
  code: string;
  expiresAt: string;
} {
  const entry = createLineLinkCode(userId);
  return {
    code: entry.code,
    expiresAt: new Date(entry.expiresAt).toISOString(),
  };
}

export function disconnectLineForUser(userId: string): boolean {
  return unlinkLineUser(userId);
}

export async function handleLineWebhookEvents(events: readonly LineWebhookEvent[]): Promise<void> {
  for (const event of events) {
    if (event.type === "follow" && event.source?.userId && event.replyToken) {
      await replyLineTextMessage({
        replyToken: event.replyToken,
        text: "ATLAS公式アカウントへようこそ。設定画面の6桁コードをこのトークに送信すると、通知連携が完了します。",
      });
      continue;
    }

    if (
      event.type === "message" &&
      event.message?.type === "text" &&
      event.source?.userId &&
      event.replyToken
    ) {
      const text = event.message.text?.trim() ?? "";
      const codeMatch = text.match(/\b(\d{6})\b/);
      if (!codeMatch) {
        await replyLineTextMessage({
          replyToken: event.replyToken,
          text: "連携するには、ATLAS設定画面に表示される6桁コードを送信してください。",
        });
        continue;
      }

      const codeEntry = consumeLineLinkCode(codeMatch[1]!);
      if (!codeEntry) {
        await replyLineTextMessage({
          replyToken: event.replyToken,
          text: "コードが無効か期限切れです。設定画面で新しいコードを発行してください。",
        });
        continue;
      }

      saveLineUserLink({
        atlasUserId: codeEntry.atlasUserId,
        lineUserId: event.source.userId,
        displayName: null,
        linkedAt: new Date().toISOString(),
      });

      await replyLineTextMessage({
        replyToken: event.replyToken,
        text: "ATLASとのLINE通知連携が完了しました。仕事完了や朝のブリーフィングなどをお届けします。",
      });
    }
  }
}

export type LineWebhookEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};
