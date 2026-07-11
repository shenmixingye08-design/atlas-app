import "server-only";

import type { LineNotifyEvent } from "@/lib/notifications/types";
import { getStoredPreferences } from "@/lib/notifications/store";
import { ensureNotificationsHydrated } from "@/lib/notifications/durable";

import {
  createLineLinkCode,
  getLineLinkByAtlasUserId,
  saveLineUserLink,
  unlinkLineUser,
  consumeLineLinkCode,
  upsertLineLinkCode,
  replaceAllLineUserLinks,
  listLineUserLinks,
} from "./link-store";
import { isLineMessagingConfigured } from "./config";
import {
  isInvalidLineAccessTokenError,
  LineApiError,
  pushLineTextMessage,
  replyLineTextMessage,
} from "./messaging";
import {
  claimLineWebhookEventId,
  ensureLineGlobalHydrated,
  removeLineGlobalCode,
  removeLineGlobalLink,
  upsertLineGlobalCode,
  upsertLineGlobalLink,
} from "./global-durable";
import {
  ensureLineLinkHydrated,
  schedulePersistLineLink,
} from "./link-durable";

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

async function applyGlobalLineSnapshot(): Promise<void> {
  const globalState = await ensureLineGlobalHydrated();
  if (globalState.links.length > 0) {
    const local = listLineUserLinks();
    const byAtlas = new Map(local.map((link) => [link.atlasUserId, link]));
    for (const link of globalState.links) {
      byAtlas.set(link.atlasUserId, link);
    }
    replaceAllLineUserLinks([...byAtlas.values()]);
  }
  for (const code of globalState.codes) {
    upsertLineLinkCode(code);
  }
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

  await ensureNotificationsHydrated(input.userId);
  await ensureLineLinkHydrated(input.userId);
  await applyGlobalLineSnapshot();

  if (!isLineEventEnabled(input.userId, input.event)) {
    return { sent: false, reason: "disabled" };
  }

  const link = getLineLinkByAtlasUserId(input.userId);
  if (!link) {
    return { sent: false, reason: "not_linked" };
  }

  try {
    await pushLineTextMessage({
      lineUserId: link.lineUserId,
      text: formatLineNotificationText(input),
    });
    return { sent: true };
  } catch (error) {
    if (isInvalidLineAccessTokenError(error)) {
      console.warn("[LINE notify] Channel access token rejected by LINE");
      return { sent: false, reason: "invalid_token" };
    }
    if (error instanceof LineApiError) {
      console.warn("[LINE notify] LINE API error:", error.status, error.message);
      return { sent: false, reason: "api_error" };
    }
    console.warn("[LINE notify]", error);
    return { sent: false, reason: "api_error" };
  }
}

export async function getLineConnectionStatus(userId: string): Promise<{
  configured: boolean;
  linked: boolean;
  displayName: string | null;
  lineEnabled: boolean;
}> {
  await ensureNotificationsHydrated(userId);
  await ensureLineLinkHydrated(userId);
  await applyGlobalLineSnapshot();

  const prefs = getStoredPreferences(userId);
  const link = getLineLinkByAtlasUserId(userId);
  return {
    configured: isLineMessagingConfigured(),
    linked: Boolean(link),
    displayName: link?.displayName ?? null,
    lineEnabled: prefs.channels.line,
  };
}

export async function issueLineLinkCodeForUser(userId: string): Promise<{
  code: string;
  expiresAt: string;
}> {
  const entry = createLineLinkCode(userId);
  await upsertLineGlobalCode(entry);
  return {
    code: entry.code,
    expiresAt: new Date(entry.expiresAt).toISOString(),
  };
}

export async function disconnectLineForUser(userId: string): Promise<boolean> {
  await ensureLineLinkHydrated(userId);
  await applyGlobalLineSnapshot();
  const removed = unlinkLineUser(userId);
  await removeLineGlobalLink(userId);
  schedulePersistLineLink(userId);
  return removed;
}

export async function handleLineWebhookEvents(
  events: readonly LineWebhookEvent[],
): Promise<void> {
  if (!isLineMessagingConfigured()) return;

  await applyGlobalLineSnapshot();

  for (const event of events) {
    const eventId = event.webhookEventId ?? null;
    const shouldProcess = await claimLineWebhookEventId(eventId);
    if (!shouldProcess) continue;

    if (event.type === "follow" && event.source?.userId && event.replyToken) {
      try {
        await replyLineTextMessage({
          replyToken: event.replyToken,
          text: "ATLAS公式アカウントへようこそ。設定画面の6桁コードをこのトークに送信すると、通知連携が完了します。",
        });
      } catch (error) {
        console.warn("[LINE webhook] follow reply failed:", error);
      }
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
        try {
          await replyLineTextMessage({
            replyToken: event.replyToken,
            text: "連携するには、ATLAS設定画面に表示される6桁コードを送信してください。",
          });
        } catch (error) {
          console.warn("[LINE webhook] reply failed:", error);
        }
        continue;
      }

      const codeEntry = consumeLineLinkCode(codeMatch[1]!);
      if (codeEntry) {
        await removeLineGlobalCode(codeEntry.code);
      }

      if (!codeEntry) {
        try {
          await replyLineTextMessage({
            replyToken: event.replyToken,
            text: "コードが無効か期限切れです。設定画面で新しいコードを発行してください。",
          });
        } catch (error) {
          console.warn("[LINE webhook] reply failed:", error);
        }
        continue;
      }

      const link = saveLineUserLink({
        atlasUserId: codeEntry.atlasUserId,
        lineUserId: event.source.userId,
        displayName: null,
        linkedAt: new Date().toISOString(),
      });
      await upsertLineGlobalLink(link);
      schedulePersistLineLink(codeEntry.atlasUserId);

      try {
        await replyLineTextMessage({
          replyToken: event.replyToken,
          text: "ATLASとのLINE通知連携が完了しました。仕事完了や朝のブリーフィングなどをお届けします。",
        });
      } catch (error) {
        console.warn("[LINE webhook] link reply failed:", error);
      }
    }
  }
}

export type LineWebhookEvent = {
  type?: string;
  replyToken?: string;
  webhookEventId?: string;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};
