/**
 * X media upload (v1.1 simple upload) — returns media_id_string.
 * Access tokens are never logged.
 */

import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { RELIABILITY_TIMEOUTS } from "@/lib/reliability";

const X_MEDIA_UPLOAD_URL =
  "https://upload.twitter.com/1.1/media/upload.json";

export async function uploadXMedia(input: {
  accessToken: string;
  imageBase64: string;
  mimeType: string;
}): Promise<string> {
  const bytes = Buffer.from(input.imageBase64.replace(/\s+/g, ""), "base64");
  const boundary = `----AtlasXMedia${Date.now().toString(36)}`;
  const filename =
    input.mimeType.includes("jpeg") || input.mimeType.includes("jpg")
      ? "image.jpg"
      : input.mimeType.includes("gif")
        ? "image.gif"
        : "image.png";

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${filename}"\r\n` +
      `Content-Type: ${input.mimeType}\r\n\r\n`,
    "utf8",
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([preamble, bytes, epilogue]);

  const response = await fetchWithTimeout(
    X_MEDIA_UPLOAD_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    },
    RELIABILITY_TIMEOUTS.x,
  );

  const payload = (await response.json().catch(() => ({}))) as {
    media_id_string?: string;
    errors?: Array<{ message?: string }>;
    detail?: string;
  };

  if (!response.ok || !payload.media_id_string) {
    const err = new Error(
      payload.errors?.[0]?.message ??
        payload.detail ??
        "X media upload failed",
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return payload.media_id_string;
}
