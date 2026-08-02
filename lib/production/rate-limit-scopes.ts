import {
  AI_API_RATE_LIMIT,
  checkRateLimit,
  recordRateLimitHit,
} from "@/lib/http/rate-limit";

export type RateLimitScope = "user" | "ip" | "automation";

const SCOPE_LIMITS = {
  user: {
    bucket: "prod-user",
    max: 120,
    windowMs: 60_000,
    minIntervalMs: 100,
  },
  ip: {
    bucket: "prod-ip",
    max: 300,
    windowMs: 60_000,
  },
  automation: {
    bucket: "prod-automation",
    max: 60,
    windowMs: 60_000,
  },
} as const;

export type ScopedRateLimitResult = {
  allowed: boolean;
  scope: RateLimitScope;
  retryAfterMs?: number;
};

/**
 * User / IP / Automation scoped rate limits for 1000-user safety.
 * In-process today (same as existing http rate-limit). Documented gap: Redis.
 */
export function enforceScopedRateLimit(
  scope: RateLimitScope,
  key: string,
): ScopedRateLimitResult {
  const options = SCOPE_LIMITS[scope];
  const scopedKey = `${scope}:${key}`;
  const checked = checkRateLimit(scopedKey, options);
  if (!checked.allowed) {
    return {
      allowed: false,
      scope,
      retryAfterMs: checked.retryAfterMs,
    };
  }
  recordRateLimitHit(scopedKey, options);
  return { allowed: true, scope };
}

/** Combine user + IP for expensive AI paths. */
export function enforceAiUserAndIpLimit(input: {
  userId: string;
  ip: string | null;
}): ScopedRateLimitResult {
  const user = enforceScopedRateLimit("user", input.userId || "anonymous");
  if (!user.allowed) return user;
  if (input.ip) {
    const ip = enforceScopedRateLimit("ip", input.ip);
    if (!ip.allowed) return ip;
  }
  // Preserve existing AI hourly budget semantics for authenticated users.
  const hourly = checkRateLimit(input.userId, AI_API_RATE_LIMIT);
  if (!hourly.allowed) {
    return {
      allowed: false,
      scope: "user",
      retryAfterMs: hourly.retryAfterMs,
    };
  }
  recordRateLimitHit(input.userId, AI_API_RATE_LIMIT);
  return { allowed: true, scope: "user" };
}

export function getRateLimitScopeConfig() {
  return SCOPE_LIMITS;
}
