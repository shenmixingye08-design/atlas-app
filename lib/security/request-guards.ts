import "server-only";

import { ownershipDeniedResponse } from "@/lib/auth/ownership";

export class UnsafeRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "UnsafeRequestError";
    this.code = code;
    this.status = status;
  }
}

const DANGEROUS_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function assertNoPrototypePollution(value: unknown, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrototypePollution(item, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  // Prefer getOwnPropertyNames so JSON "__proto__" own keys are visible.
  for (const key of Object.getOwnPropertyNames(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new UnsafeRequestError(
        "prototype_pollution",
        "不正なリクエストです",
      );
    }
    assertNoPrototypePollution(
      (value as Record<string, unknown>)[key],
      depth + 1,
    );
  }
}

export const MAX_JSON_BODY_BYTES = 256 * 1024;

/**
 * Parse JSON with size + prototype pollution guards.
 * Fail-closed on malformed / oversized / dangerous keys.
 */
export async function readJsonBodySafe(
  request: Request,
  options?: { maxBytes?: number },
): Promise<unknown> {
  const maxBytes = options?.maxBytes ?? MAX_JSON_BODY_BYTES;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new UnsafeRequestError("payload_too_large", "リクエストが大きすぎます", 413);
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new UnsafeRequestError("payload_too_large", "リクエストが大きすぎます", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8") || "null");
  } catch {
    throw new UnsafeRequestError("invalid_json", "Invalid JSON body", 400);
  }

  assertNoPrototypePollution(parsed);
  return parsed;
}

/**
 * Ignore client-supplied identity fields. Session userId wins.
 */
export function assertNoForgedIdentity(input: {
  authenticatedUserId: string;
  body?: Record<string, unknown> | null;
  query?: URLSearchParams | null;
}): { ok: true } | { ok: false; response: Response } {
  const candidates: unknown[] = [];
  if (input.body) {
    candidates.push(
      input.body.userId,
      input.body.user_id,
      input.body.ownerId,
      input.body.owner_id,
    );
  }
  if (input.query) {
    candidates.push(
      input.query.get("userId"),
      input.query.get("user_id"),
      input.query.get("ownerId"),
    );
  }
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (candidate.trim() !== input.authenticatedUserId) {
      return { ok: false, response: ownershipDeniedResponse(403) };
    }
  }
  return { ok: true };
}

/** jobId / deliverableId must be opaque ids — reject path traversal payloads. */
export function assertSafeResourceId(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new UnsafeRequestError("invalid_id", `${fieldName} が不正です`);
  }
  const id = value.trim();
  if (
    id.includes("..") ||
    id.includes("/") ||
    id.includes("\\") ||
    id.includes("%2e") ||
    id.includes("%2E") ||
    id.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(id)
  ) {
    throw new UnsafeRequestError("invalid_id", `${fieldName} が不正です`);
  }
  return id;
}
