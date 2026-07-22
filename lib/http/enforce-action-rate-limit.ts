import {
  checkRateLimit,
  recordRateLimitHit,
} from "@/lib/http/rate-limit";

export const DOCUMENT_RENDER_RATE_LIMIT = {
  bucket: "document-render",
  max: 30,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 1000,
} as const;

export const AUTOMATION_TEST_RUN_RATE_LIMIT = {
  bucket: "automation-test-run",
  max: 10,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 3000,
} as const;

function buildRateLimitResponse(retryAfterMs?: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil((retryAfterMs ?? 1000) / 1000));
  return Response.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

export function enforceDocumentRenderRateLimit(userId: string): Response | null {
  const gate = checkRateLimit(userId, DOCUMENT_RENDER_RATE_LIMIT);
  if (!gate.allowed) return buildRateLimitResponse(gate.retryAfterMs);
  recordRateLimitHit(userId, DOCUMENT_RENDER_RATE_LIMIT);
  return null;
}

export function enforceAutomationTestRunRateLimit(userId: string): Response | null {
  const gate = checkRateLimit(userId, AUTOMATION_TEST_RUN_RATE_LIMIT);
  if (!gate.allowed) return buildRateLimitResponse(gate.retryAfterMs);
  recordRateLimitHit(userId, AUTOMATION_TEST_RUN_RATE_LIMIT);
  return null;
}
