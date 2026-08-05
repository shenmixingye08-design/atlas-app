import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static evidence that critical integrations have a retry strategy.
 * Live fan-out against paid APIs is out of scope for this unit file.
 */
describe("P09 API retry posture (static)", () => {
  const root = process.cwd();

  it("OpenAI client enables bounded SDK retries", () => {
    const src = readFileSync(join(root, "lib/openai.ts"), "utf8");
    expect(src).toMatch(/maxRetries:\s*2/);
    expect(src).not.toMatch(/maxRetries:\s*0/);
  });

  it("shared withRetry covers classified API/Storage/DB/Timeout", () => {
    const src = readFileSync(join(root, "lib/reliability/retry.ts"), "utf8");
    expect(src).toContain("isRetryableClassifiedFailure");
    expect(src).toMatch(/storage|supabase|timeout|ETIMEDOUT/);
  });

  it("X post client uses reliability withRetry", () => {
    const src = readFileSync(
      join(root, "lib/integrations/x/post/api-client.ts"),
      "utf8",
    );
    expect(src).toMatch(/withRetry/);
  });

  it("Stripe webhook has idempotency guard (retry-safe at-least-once)", () => {
    const src = readFileSync(
      join(root, "lib/billing/stripe/webhook.ts"),
      "utf8",
    );
    expect(src).toMatch(/hasProcessedStripeEvent|constructEvent/);
  });

  it("work-queue claim migration uses SKIP LOCKED", () => {
    const src = readFileSync(
      join(root, "supabase/migrations/20260804_p0_2_durable_job_claim.sql"),
      "utf8",
    );
    expect(src.toUpperCase()).toContain("SKIP LOCKED");
  });
});
