import {
  AI_API_RATE_LIMIT,
  consumeDistributedRateLimit,
} from "@/lib/http/rate-limit";

/**
 * Enforce distributed AI burst limit for an authenticated user.
 * Must be awaited at every AI/OpenAI entry route (P1-06).
 */
export async function enforceAiRateLimit(
  userId: string,
): Promise<Response | null> {
  const gate = await consumeDistributedRateLimit(userId, AI_API_RATE_LIMIT);
  if (!gate.allowed) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((gate.retryAfterMs || 1000) / 1000),
    );
    return Response.json(
      {
        error: "Too many requests. Please try again later.",
        code: "rate_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }
  return null;
}
