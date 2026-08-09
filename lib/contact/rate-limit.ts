import { contactSpamConfig } from "./spam";
import {
  consumeDistributedRateLimit,
  resetDistributedRateLimitStoreForTests,
} from "@/lib/http/rate-limit";

const CONTACT_BUCKET = "contact";

export async function checkContactRateLimit(clientIp: string): Promise<{
  allowed: boolean;
  retryAfterMs?: number;
}> {
  // Atomic consume — counts the attempt (spam-resistant; no check/record race).
  const result = await consumeDistributedRateLimit(clientIp, {
    bucket: CONTACT_BUCKET,
    max: contactSpamConfig.maxSubmissionsPerHour,
    windowMs: 60 * 60 * 1000,
    minIntervalMs: contactSpamConfig.minSubmitIntervalMs,
  });
  return {
    allowed: result.allowed,
    retryAfterMs: result.retryAfterMs,
  };
}

/** @deprecated consume happens in checkContactRateLimit */
export async function recordContactSubmission(clientIp: string): Promise<void> {
  void clientIp;
}

export function resetContactRateLimitStore(): void {
  void resetDistributedRateLimitStoreForTests();
}
