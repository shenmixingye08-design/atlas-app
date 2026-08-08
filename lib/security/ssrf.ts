import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

export class SsrfBlockedError extends Error {
  readonly code = "ssrf_blocked" as const;

  constructor(message = "このURLへのアクセスは許可されていません") {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "metadata.aws.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function u32and(n: number, mask: number): number {
  // JS bitwise ops are signed 32-bit — force unsigned comparison.
  return (n & mask) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;
  // 0.0.0.0/8
  if (u32and(n, 0xff000000) === 0x00000000) return true;
  // 10.0.0.0/8
  if (u32and(n, 0xff000000) === 0x0a000000) return true;
  // 127.0.0.0/8
  if (u32and(n, 0xff000000) === 0x7f000000) return true;
  // 169.254.0.0/16 link-local / metadata
  if (u32and(n, 0xffff0000) === 0xa9fe0000) return true;
  // 172.16.0.0/12
  if (u32and(n, 0xfff00000) === 0xac100000) return true;
  // 192.168.0.0/16
  if (u32and(n, 0xffff0000) === 0xc0a80000) return true;
  // 100.64.0.0/10 CGNAT
  if (u32and(n, 0xffc00000) === 0x64400000) return true;
  // 192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 docs/test
  if (u32and(n, 0xffffff00) === 0xc0000000) return true;
  if (u32and(n, 0xffffff00) === 0xc0000200) return true;
  if (u32and(n, 0xffffff00) === 0xc6336400) return true;
  if (u32and(n, 0xffffff00) === 0xcb007100) return true;
  // multicast / reserved
  if (u32and(n, 0xf0000000) === 0xe0000000) return true;
  if (u32and(n, 0xf0000000) === 0xf0000000) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("ff")) return true; // multicast
  // IPv4-mapped
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1] && isBlockedIpv4(mapped[1])) return true;
  const mappedHex = normalized.match(/^::ffff:([0-9a-f:]+)$/);
  if (mappedHex) {
    // leave as blocked if we cannot parse as public
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

export function assertSafeOutboundUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SsrfBlockedError("無効なURLです");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("http または https のURLのみ許可されています");
  }

  if (url.username || url.password) {
    throw new SsrfBlockedError("認証情報を含むURLは許可されていません");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) {
    throw new SsrfBlockedError("ホスト名がありません");
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SsrfBlockedError("内部ホストへのアクセスは許可されていません");
  }

  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new SsrfBlockedError("プライベートIPへのアクセスは許可されていません");
  }

  return url;
}

/**
 * Resolve hostname and reject private/link-local/metadata destinations.
 * Mitigates basic DNS rebinding by validating resolved addresses before fetch.
 */
export async function assertSafeOutboundDestination(raw: string): Promise<URL> {
  const url = assertSafeOutboundUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new SsrfBlockedError("プライベートIPへのアクセスは許可されていません");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError("ホスト名を解決できません");
  }

  if (addresses.length === 0) {
    throw new SsrfBlockedError("ホスト名を解決できません");
  }

  for (const entry of addresses) {
    if (isBlockedIpAddress(entry.address)) {
      throw new SsrfBlockedError("プライベートIPへのアクセスは許可されていません");
    }
  }

  return url;
}

export type SafeFetchResult = {
  response: Response;
  finalUrl: string;
  bytes: Buffer;
};

/**
 * SSRF-safe outbound GET: validate URL + DNS, manual redirects with re-check,
 * timeout, and max response bytes.
 */
export async function fetchSafeOutboundUrl(
  raw: string,
  options?: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    headers?: HeadersInit;
  },
): Promise<SafeFetchResult> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const maxBytes = options?.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options?.maxRedirects ?? 3;

  let current = raw.trim();
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const safeUrl = await assertSafeOutboundDestination(current);
    const response = await fetchWithTimeout(
      safeUrl.toString(),
      {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: options?.headers,
      },
      timeoutMs,
    );

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      // Drain body to free socket.
      await response.arrayBuffer().catch(() => undefined);
      if (!location) {
        throw new SsrfBlockedError("リダイレクト先が無効です");
      }
      current = new URL(location, safeUrl).toString();
      continue;
    }

    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      throw new SsrfBlockedError("外部リソースの取得に失敗しました");
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.arrayBuffer().catch(() => undefined);
      throw new SsrfBlockedError("外部リソースが大きすぎます");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new SsrfBlockedError("外部リソースが大きすぎます");
    }

    return {
      response,
      finalUrl: safeUrl.toString(),
      bytes: Buffer.from(arrayBuffer),
    };
  }

  throw new SsrfBlockedError("リダイレクトが多すぎます");
}
