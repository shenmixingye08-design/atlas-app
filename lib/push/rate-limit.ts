import { consumeDistributedRateLimit } from "@/lib/http/rate-limit";

/** Distributed rate limit for push / upload blast APIs (per user key). */
export async function checkPushRateLimit(
  userId: string,
  maxPerWindow = 5,
  windowMs = 60_000,
): Promise<boolean> {
  const result = await consumeDistributedRateLimit(userId, {
    bucket: "push-api",
    max: maxPerWindow,
    windowMs,
  });
  return result.allowed;
}
