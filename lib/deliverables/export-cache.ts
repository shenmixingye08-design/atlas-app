import { createHash } from "crypto";

import type { DeliverableFormat } from "./types";
import type { WordTemplateId } from "./word-templates";

/**
 * Deterministic export cache — same content + template + format reuses
 * previously rendered binary. No AI involved.
 */

export const EXPORT_CACHE_VERSION = "export-cache-v1";

export type ExportCacheKeyInput = {
  content: string;
  format: DeliverableFormat;
  templateId?: WordTemplateId | string | null;
  brandFingerprint?: string | null;
  baseFileName?: string | null;
};

export type ExportCacheEntry = {
  key: string;
  format: DeliverableFormat;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  contentSha256: string;
  createdAt: number;
};

type CacheBucket = {
  entries: Map<string, ExportCacheEntry>;
};

const MAX_ENTRIES = 200;

function getBucket(): CacheBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasExportCache?: CacheBucket;
  };
  if (!scope.__atlasExportCache) {
    scope.__atlasExportCache = { entries: new Map() };
  }
  return scope.__atlasExportCache;
}

export function resetExportCacheForTests(): void {
  getBucket().entries.clear();
}

export function buildExportCacheKey(input: ExportCacheKeyInput): string {
  const normalized = input.content.replace(/\r\n/g, "\n").trim();
  const payload = [
    EXPORT_CACHE_VERSION,
    input.format,
    input.templateId ?? "",
    input.brandFingerprint ?? "",
    input.baseFileName ?? "",
    createHash("sha256").update(normalized).digest("hex"),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function getExportCacheEntry(key: string): ExportCacheEntry | null {
  return getBucket().entries.get(key) ?? null;
}

export function setExportCacheEntry(entry: ExportCacheEntry): void {
  const bucket = getBucket();
  if (bucket.entries.size >= MAX_ENTRIES) {
    const oldest = bucket.entries.keys().next().value;
    if (oldest) bucket.entries.delete(oldest);
  }
  bucket.entries.set(entry.key, entry);
}

/**
 * Brand fingerprint for cache keys — never stores secrets; only stable ids.
 */
export function brandFingerprintFromBrand(brand: {
  companyName?: string | null;
  contactName?: string | null;
  footerText?: string | null;
  brandColor?: string | null;
  defaultFont?: string | null;
  logoDataUrl?: string | null;
} | null | undefined): string {
  if (!brand) return "";
  return createHash("sha256")
    .update(
      [
        brand.companyName ?? "",
        brand.contactName ?? "",
        brand.footerText ?? "",
        brand.brandColor ?? "",
        brand.defaultFont ?? "",
        brand.logoDataUrl ? createHash("sha256").update(brand.logoDataUrl).digest("hex").slice(0, 16) : "",
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}
