import { contactSpamConfig } from "./spam";
import {
  checkRateLimit,
  recordRateLimitHit,
  resetRateLimitBucket,
} from "@/lib/http/rate-limit";

const CONTACT_BUCKET = "contact";

export function checkContactRateLimit(clientIp: string): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  return checkRateLimit(clientIp, {
    bucket: CONTACT_BUCKET,
    max: contactSpamConfig.maxSubmissionsPerHour,
    windowMs: 60 * 60 * 1000,
    minIntervalMs: contactSpamConfig.minSubmitIntervalMs,
  });
}

export function recordContactSubmission(clientIp: string): void {
  recordRateLimitHit(clientIp, {
    bucket: CONTACT_BUCKET,
    windowMs: 60 * 60 * 1000,
  });
}

export function resetContactRateLimitStore(): void {
  resetRateLimitBucket(CONTACT_BUCKET);
}
