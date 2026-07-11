/** LINE Messaging API configuration (server-only). */
export const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
export const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

export function getLineChannelAccessToken(): string {
  const value =
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim();
  if (!value) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN is not configured. Add it to .env.local for LINE notifications.",
    );
  }
  return value;
}

export function getLineChannelSecret(): string {
  const value =
    process.env.LINE_CHANNEL_SECRET?.trim() ||
    process.env.LINE_MESSAGING_CHANNEL_SECRET?.trim();
  if (!value) {
    throw new Error(
      "LINE_CHANNEL_SECRET is not configured. Add it to .env.local for LINE webhooks.",
    );
  }
  return value;
}

export function isLineMessagingConfigured(): boolean {
  return Boolean(
    (process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
      process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim()) &&
      (process.env.LINE_CHANNEL_SECRET?.trim() ||
        process.env.LINE_MESSAGING_CHANNEL_SECRET?.trim()),
  );
}

export function getLineBotBasicId(): string | null {
  return process.env.LINE_BOT_BASIC_ID?.trim() || null;
}
