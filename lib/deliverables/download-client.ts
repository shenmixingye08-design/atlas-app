"use client";

import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";

import {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_MIME_TYPES,
  type DeliverableFormat,
} from "./types";

export type DownloadDeliverableInput = {
  /** Same-origin API path or absolute URL (prefer `/api/deliverables/:id`). */
  url: string;
  fileName: string;
  /** Required for Word/PDF — used to force the correct MIME (never octet-stream). */
  mimeType?: string;
  format?: DeliverableFormat;
};

const FORBIDDEN_MIME = new Set([
  "text/plain",
  "application/json",
  "application/octet-stream",
  "text/html",
]);

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

function guessFormat(
  fileName: string,
  mimeType: string | undefined,
  explicit?: DeliverableFormat,
): DeliverableFormat | null {
  if (explicit) return explicit;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx") || mimeType?.includes("wordprocessingml")) {
    return "docx";
  }
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".xlsx") || mimeType?.includes("spreadsheetml")) {
    return "xlsx";
  }
  if (lower.endsWith(".pptx") || mimeType?.includes("presentationml")) {
    return "pptx";
  }
  if (lower.endsWith(".md") || mimeType?.includes("markdown")) return "md";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

function ensureFileName(fileName: string, format: DeliverableFormat | null): string {
  const trimmed = fileName.trim() || "download";
  if (!format) return trimmed;
  const ext = DELIVERABLE_EXTENSIONS[format];
  if (trimmed.toLowerCase().endsWith(ext)) return trimmed;
  return `${trimmed.replace(/\.[^.]+$/, "") || "document"}${ext}`;
}

function resolveMimeType(
  headerType: string | null,
  format: DeliverableFormat | null,
  fallbackMime: string | undefined,
): string {
  const header = headerType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (format) {
    // Always prefer canonical MIME for known binary formats.
    return DELIVERABLE_MIME_TYPES[format].split(";")[0]!.trim();
  }
  if (header && !FORBIDDEN_MIME.has(header)) {
    return header;
  }
  const fallback = (fallbackMime ?? "").split(";")[0]!.trim().toLowerCase();
  if (fallback && !FORBIDDEN_MIME.has(fallback)) {
    return fallbackMime!.split(";")[0]!.trim();
  }
  throw new Error(
    "ファイル形式を確認できませんでした。もう一度生成してください。",
  );
}

function isZipMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
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
 * user gesture → same-origin fetch (cookies) → ArrayBuffer → Uint8Array → Blob
 * → temporary <a download> → delayed revoke.
 *
 * Never Blob-ifies String / JSON / XML text for Word/PDF.
 * Never uses application/octet-stream or text/plain for Office downloads.
 */
export async function downloadDeliverableFile(
  input: DownloadDeliverableInput,
): Promise<void> {
  const format = guessFormat(input.fileName, input.mimeType, input.format);
  const fileName = ensureFileName(input.fileName, format);

  const response = await fetch(resolveDownloadUrl(input.url), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "manual",
    headers: {
      Accept:
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : format === "pdf"
            ? "application/pdf"
            : "*/*",
    },
  });

  // Auth redirects / opaque redirects must not become "HTML error blobs".
  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new Error(
      "認証セッションが無効です。再ログイン後にもう一度お試しください。",
    );
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const headerType = response.headers.get("Content-Type");
  const headerMime = headerType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (FORBIDDEN_MIME.has(headerMime)) {
    throw new Error(
      "サーバーが不正な形式でファイルを返しました。Word生成をやり直してください。",
    );
  }

  const mimeType = resolveMimeType(headerType, format, input.mimeType);

  // Read as ArrayBuffer only — never response.text() for binary formats.
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("ファイルが空です（0KB）。もう一度生成してください。");
  }

  // CRITICAL: Blob must receive Uint8Array of completed binary, not string/JSON.
  const bytes = new Uint8Array(arrayBuffer);

  // Guard against HTML/JSON error bodies served with a misleading 200.
  if (bytes[0] === 0x3c /* < */ || bytes[0] === 0x7b /* { */) {
    const sniff = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
    if (
      sniff.startsWith("<!DOCTYPE") ||
      sniff.startsWith("<html") ||
      sniff.startsWith("{")
    ) {
      throw new Error(
        "ダウンロード応答がHTML/JSONです。認証またはサーバーエラーを確認してください。",
      );
    }
  }

  if (format === "docx" || format === "xlsx" || format === "pptx") {
    if (!isZipMagic(bytes)) {
      throw new Error(
        "Wordファイルが壊れています（ZIP署名がありません）。再生成してください。",
      );
    }
  }
  if (format === "pdf" && !isPdfMagic(bytes)) {
    throw new Error("PDFファイルが壊れています。再生成してください。");
  }

  // Copy into a fresh ArrayBuffer-backed Uint8Array so the Blob owns binary bytes.
  const binaryCopy = new Uint8Array(bytes.byteLength);
  binaryCopy.set(bytes);

  const blob = new Blob([binaryCopy], { type: mimeType });
  if (blob.size === 0) {
    throw new Error("Blob生成に失敗しました。");
  }
  if (FORBIDDEN_MIME.has(blob.type.split(";")[0]!.trim().toLowerCase())) {
    throw new Error("不正なMIMEでBlob化されようとしました。");
  }

  await triggerBlobDownload(blob, fileName);
}
