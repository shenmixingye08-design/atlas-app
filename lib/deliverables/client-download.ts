"use client";

import type { DeliverableFormat } from "./types";

export type OfficeDownloadFormat = "docx" | "pdf";

export type OfficeDownloadError = {
  format: OfficeDownloadFormat;
  message: string;
  cause?: string;
};

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the browser has a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Download from base64 already returned by /api/deliverables/generate. */
export function downloadFromBase64(input: {
  base64: string;
  fileName: string;
  mimeType: string;
}): void {
  const blob = base64ToBlob(input.base64, input.mimeType);
  if (blob.size < 64) {
    throw new Error("ダウンロード対象ファイルが空です（0KB）。");
  }
  triggerBlobDownload(blob, input.fileName);
}

/**
 * Ask the server to generate Word/PDF on demand and download the binary.
 * Works on Vercel because generation happens in the same request as the response.
 */
export async function downloadOfficeViaExportApi(input: {
  format: OfficeDownloadFormat;
  content: string;
  assignment: string;
  title?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch("/api/deliverables/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      format: input.format,
      content: input.content,
      assignment: input.assignment,
      title: input.title,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    let cause = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string; cause?: string };
      cause = data.cause ?? data.error ?? cause;
    } catch {
      // keep HTTP status message
    }
    throw Object.assign(
      new Error(
        input.format === "docx"
          ? "Word生成に失敗しました"
          : "PDF生成に失敗しました",
      ),
      { cause },
    );
  }

  const blob = await response.blob();
  if (blob.size < 64) {
    throw Object.assign(
      new Error(
        input.format === "docx"
          ? "Word生成に失敗しました"
          : "PDF生成に失敗しました",
      ),
      { cause: "生成ファイルが空です（0KB）" },
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const fileName = utf8Name
    ? decodeURIComponent(utf8Name)
    : plainName
      ? decodeURIComponent(plainName)
      : input.format === "docx"
        ? "minervot.docx"
        : "minervot.pdf";

  triggerBlobDownload(blob, fileName);
}

export function isOfficeDownloadFormat(
  format: DeliverableFormat,
): format is OfficeDownloadFormat {
  return format === "docx" || format === "pdf";
}
