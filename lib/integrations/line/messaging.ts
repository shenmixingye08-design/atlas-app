import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import {
  getLineChannelAccessToken,
  getLineChannelSecret,
  isLineMessagingConfigured,
  LINE_PUSH_URL,
  LINE_REPLY_URL,
} from "./config";

export type LineTextMessage = {
  type: "text";
  text: string;
};

export class LineApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LineApiError";
    this.status = status;
  }
}

export function isInvalidLineAccessTokenError(error: unknown): boolean {
  return error instanceof LineApiError && (error.status === 401 || error.status === 403);
}

async function readLineErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  // Never echo Authorization headers or tokens — LINE message only.
  return payload?.message ?? `LINE API request failed (${response.status})`;
}

export async function pushLineTextMessage(input: {
  lineUserId: string;
  text: string;
}): Promise<void> {
  if (!isLineMessagingConfigured()) {
    throw new LineApiError("LINE Messaging API is not configured", 503);
  }

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
    throw new LineApiError(await readLineErrorMessage(response), response.status);
  }
}

export async function replyLineTextMessage(input: {
  replyToken: string;
  text: string;
}): Promise<void> {
  if (!isLineMessagingConfigured()) {
    throw new LineApiError("LINE Messaging API is not configured", 503);
  }

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
    throw new LineApiError(await readLineErrorMessage(response), response.status);
  }
}

export function verifyLineWebhookSignature(
  body: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  if (!isLineMessagingConfigured()) return false;

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
