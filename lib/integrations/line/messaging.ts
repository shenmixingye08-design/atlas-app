import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import { getLineChannelAccessToken, getLineChannelSecret, LINE_PUSH_URL, LINE_REPLY_URL } from "./config";

export type LineTextMessage = {
  type: "text";
  text: string;
};

export async function pushLineTextMessage(input: {
  lineUserId: string;
  text: string;
}): Promise<void> {
  const token = getLineChannelAccessToken();
  const body = {
    to: input.lineUserId,
    messages: [
      {
        type: "text",
        text: input.text.slice(0, 4900),
      } satisfies LineTextMessage,
    ],
  };

  const response = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "LINE push message failed");
  }
}

export async function replyLineTextMessage(input: {
  replyToken: string;
  text: string;
}): Promise<void> {
  const token = getLineChannelAccessToken();
  const response = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken: input.replyToken,
      messages: [{ type: "text", text: input.text.slice(0, 4900) }],
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "LINE reply message failed");
  }
}

export function verifyLineWebhookSignature(
  body: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const secret = getLineChannelSecret();
  const digest = createHmac("sha256", secret).update(body).digest("base64");

  try {
    const expected = Buffer.from(digest);
    const actual = Buffer.from(signatureHeader);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
