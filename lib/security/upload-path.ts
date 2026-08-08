/**
 * P0-05: Storage path / filename hardening.
 * Never use client filenames as storage keys.
 */

const TRAVERSAL =
  /(\.\.|%2e%2e|%252e|%c0%ae|%c0%af|%2f|%5c|\0|%00)/i;

export class UnsafePathError extends Error {
  readonly code = "unsafe_path" as const;

  constructor(message = "不正なファイル名です") {
    super(message);
    this.name = "UnsafePathError";
  }
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Reject path traversal / encoded traversal / null bytes. */
export function assertSafeUploadFileName(name: string): void {
  if (!name || !name.trim()) {
    throw new UnsafePathError("ファイル名が空です");
  }
  const decoded = decodeOnce(decodeOnce(name.trim()));
  if (
    TRAVERSAL.test(name) ||
    TRAVERSAL.test(decoded) ||
    decoded.includes("..") ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0")
  ) {
    throw new UnsafePathError("不正なファイル名です");
  }
}

/**
 * Strip directories and dangerous characters. Does not become a storage key.
 */
export function sanitizeDisplayFileName(name: string): string {
  assertSafeUploadFileName(name);
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^\w.\u3040-\u30ff\u4e00-\u9fff()-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  if (!cleaned || cleaned.includes("..")) {
    throw new UnsafePathError("不正なファイル名です");
  }
  const lower = cleaned.toLowerCase();
  // photo.jpg.exe / report.pdf.js style double extensions
  if (/\.(jpe?g|png|webp|gif|pdf|docx|xlsx|pptx|txt|csv)\.(exe|js|mjs|cjs|sh|bat|cmd|ps1|vbs|html|htm|svg|php|jar|dll)$/i.test(lower)) {
    throw new UnsafePathError("不正なファイル名です");
  }
  if (/\.(exe|bat|cmd|ps1|vbs|html|htm|svg|php|jar|dll)$/i.test(lower)) {
    throw new UnsafePathError("このファイル形式には対応していません");
  }
  return cleaned || "file";
}

/** Opaque storage key segment — never derived from raw client path. */
export function toStorageKeySegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  if (!cleaned || cleaned.includes("..")) {
    return "unknown";
  }
  return cleaned;
}

export function buildUserScopedObjectPath(input: {
  userId: string;
  jobId: string;
  objectId: string;
  fileName: string;
}): string {
  return [
    toStorageKeySegment(input.userId),
    toStorageKeySegment(input.jobId),
    toStorageKeySegment(input.objectId),
    toStorageKeySegment(input.fileName),
  ].join("/");
}
