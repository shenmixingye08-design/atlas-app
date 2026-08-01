import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { IntegrationHttpError } from "@/lib/integrations/production/retry";

const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const DEFAULT_TIMEOUT_MS = 30_000;

export type XMediaUploadInput = {
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
};

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/**
 * Upload an image to X media endpoint (simple upload for ≤5MB images).
 * Returns media_id_string for tweet attachment.
 */
export async function uploadXImageMedia(
  input: XMediaUploadInput,
): Promise<{ mediaId: string }> {
  if (!input.buffer.length) {
    throw new Error("画像データが空です");
  }
  if (input.buffer.length > 5 * 1024 * 1024) {
    throw new Error("画像は5MB以下にしてください");
  }
  if (!/^image\/(jpeg|png|gif|webp)$/i.test(input.mimeType)) {
    throw new Error("対応画像形式は jpeg / png / gif / webp です");
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.buffer)], {
    type: input.mimeType,
  });
  form.append("media", blob, "media");

  const response = await fetchWithTimeout(
    MEDIA_UPLOAD_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: form,
    },
    DEFAULT_TIMEOUT_MS,
  );

  const payload = (await response.json().catch(() => ({}))) as {
    media_id_string?: string;
    media_id?: number;
    errors?: Array<{ message?: string }>;
    detail?: string;
  };

  if (!response.ok) {
    throw new IntegrationHttpError(
      response.status,
      payload.errors?.[0]?.message ??
        payload.detail ??
        `X media upload failed (${response.status})`,
      { retryAfterMs: parseRetryAfterMs(response) },
    );
  }

  const mediaId =
    payload.media_id_string ??
    (typeof payload.media_id === "number" ? String(payload.media_id) : null);
  if (!mediaId) {
    throw new Error("X media upload did not return media_id");
  }

  return { mediaId };
}
