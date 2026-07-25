"use client";

import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";

export type DownloadDeliverableInput = {
  /** Same-origin API path or absolute URL (prefer `/api/deliverables/:id`). */
  url: string;
  fileName: string;
  /** Fallback MIME when the response omits Content-Type. */
  mimeType?: string;
};

function resolveDownloadUrl(url: string): string {
  if (url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Fall through and use the original URL.
  }

  return url;
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      return payload.error ?? payload.message ?? `Download failed (${response.status})`;
    } catch {
      // Fall through.
    }
  }

  const text = await response.text().catch(() => "");
  if (text && !text.trimStart().startsWith("<")) {
    return text.slice(0, 200);
  }

  return `Download failed (${response.status})`;
}

/**
 * Android Chrome–safe deliverable download:
 * user gesture → same-origin fetch (cookies) → Blob → temporary <a download> → delayed revoke.
 * Does not use window.open().
 */
export async function downloadDeliverableFile(
  input: DownloadDeliverableInput,
): Promise<void> {
  const response = await fetch(resolveDownloadUrl(input.url), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "manual",
  });

  // Auth redirects / opaque redirects must not become "HTML error blobs".
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new Error("認証セッションが無効です。再ログイン後にもう一度お試しください。");
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const headerType = response.headers.get("Content-Type")?.split(";")[0]?.trim();
  const mimeType =
    headerType && headerType !== "application/json" && headerType !== "text/html"
      ? headerType
      : input.mimeType ?? "application/octet-stream";

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error("ファイルが空です（0KB）。もう一度生成してください。");
  }

  // Guard against HTML/JSON error bodies served with a misleading 200.
  const sniff = new TextDecoder().decode(buffer.slice(0, 64)).trimStart();
  if (
    mimeType.startsWith("text/html") ||
    sniff.startsWith("<!DOCTYPE") ||
    sniff.startsWith("<html")
  ) {
    throw new Error("ダウンロード応答がHTMLです。認証またはサーバーエラーを確認してください。");
  }

  const blob = new Blob([buffer], { type: mimeType });
  await triggerBlobDownload(blob, input.fileName);
}
