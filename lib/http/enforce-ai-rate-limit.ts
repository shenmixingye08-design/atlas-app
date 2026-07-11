import {
  AI_API_RATE_LIMIT,
  checkRateLimit,
  recordRateLimitHit,
} from "@/lib/http/rate-limit";

export function enforceAiRateLimit(userId: string): Response | null {
  const gate = checkRateLimit(userId, AI_API_RATE_LIMIT);
  if (!gate.allowed) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((gate.retryAfterMs ?? 1000) / 1000),
    );
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }
  recordRateLimitHit(userId, AI_API_RATE_LIMIT);
  return null;
}
