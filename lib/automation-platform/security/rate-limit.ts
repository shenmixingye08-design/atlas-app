import { consumeDistributedRateLimit } from "@/lib/http/rate-limit";
import { resetDistributedRateLimitStoreForTests } from "@/lib/rate-limit/db-store";

export async function checkAutomationRateLimit(input: {
  userId: string;
  action: string;
  limit?: number;
  windowMs?: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const limit = input.limit ?? 60;
  const windowMs = input.windowMs ?? 60_000;
  const key = `${input.userId}:${input.action}`;
  const result = await consumeDistributedRateLimit(key, {
    bucket: "automation-api",
    max: limit,
    windowMs,
  });
  return { allowed: result.allowed, remaining: result.remaining };
}

export function resetAutomationRateLimitForTests(): void {
  resetDistributedRateLimitStoreForTests();
}
