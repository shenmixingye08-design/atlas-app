/** Shared parser for atlas_consume_rate_limit RPC results. */

export type ParsedConsumeResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  hitCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? asRecord(value[0]) : null;
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function parseConsumeRateLimitRpcData(
  data: unknown,
): ParsedConsumeResult | null {
  const payload = asRecord(data);
  if (!payload) return null;
  if (!("allowed" in payload)) return null;
  return {
    allowed:
      payload.allowed === true ||
      payload.allowed === "true" ||
      payload.allowed === 1,
    remaining: asNumber(payload.remaining, 0),
    retryAfterMs: asNumber(
      payload.retry_after_ms ?? payload.retryAfterMs,
      0,
    ),
    hitCount: asNumber(payload.hit_count ?? payload.hitCount, 0),
  };
}
