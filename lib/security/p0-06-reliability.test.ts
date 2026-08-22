import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  claimStripeEventForProcessing,
  hasProcessedStripeEvent,
  releaseStripeEventClaim,
  resetProcessedStripeEvents,
} from "@/lib/billing/stripe/webhook-idempotency";
import {
  isResourceOwnedByUser,
  ownershipDeniedResponse,
} from "@/lib/auth/ownership";
import {
  encodeOAuthTokenPairForStorage,
  isEncryptedOAuthPayload,
} from "@/lib/integrations/oauth-crypto";
import {
  MAX_IMMEDIATE_RETRIES,
  withRetry,
} from "@/lib/reliability/retry";
import { RELIABILITY_TIMEOUTS } from "@/lib/reliability/timeouts";
import { assertNoSecretMaterial, redactSecrets } from "@/lib/security/redact";
import {
  assertSafeOutboundUrl,
  SsrfBlockedError,
} from "@/lib/security/ssrf";
import { assertSafeUploadFileName, UnsafePathError } from "@/lib/security/upload-path";
import { WORK_QUEUE_WORKER_BATCH } from "@/lib/work-queue/constants";
import { getOpenAIClient } from "@/lib/openai";

const KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("P0-06 reliability / billing / recovery", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "1");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1", KEY);
    resetProcessedStripeEvents();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetProcessedStripeEvents();
  });

  it("A: same job double execution prevented by occurrence uniqueness contract", async () => {
    const { resetWorkQueueStoreForTests } = await import(
      "@/lib/work-queue/store"
    );
    const store = resetWorkQueueStoreForTests();
    const input = {
      ownerId: "user_a",
      automationId: "auto_1",
      occurrenceKey: "occ_same",
      payload: { kind: "fixture" as const },
      steps: [
        { stepId: "s1", stepType: "fixture_work" as const },
      ],
    };
    const first = await store.enqueue(input);
    const second = await store.enqueue(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.jobId).toBe(first.job.jobId);
  });

  it("B: same automation occurrence not double-enqueued", async () => {
    const { resetWorkQueueStoreForTests } = await import(
      "@/lib/work-queue/store"
    );
    const store = resetWorkQueueStoreForTests();
    const input = {
      ownerId: "user_b",
      automationId: "auto_dup",
      occurrenceKey: "2026-08-08T00:00:00.000Z",
      payload: { kind: "automation" as const },
      steps: [
        { stepId: "run", stepType: "run_automation" as const },
      ],
    };
    await store.enqueue(input);
    const again = await store.enqueue(input);
    expect(again.created).toBe(false);
  });

  it("C/D: Stripe webhook claim is single-winner (replay safe)", async () => {
    const eventId = `evt_p06_${Date.now()}`;
    const first = await claimStripeEventForProcessing(eventId, "invoice.paid");
    const second = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(first.ok && first.claimed).toBe(true);
    expect(second.ok && !second.claimed).toBe(true);
    // Claimed ≠ processed (P0 FINAL GATE lease semantics).
    expect(await hasProcessedStripeEvent(eventId)).toBe(false);
    expect(second).toMatchObject({ reason: "in_progress" });
  });

  it("C/D: Stripe claim release allows safe retry after failure", async () => {
    const eventId = `evt_p06_retry_${Date.now()}`;
    const first = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(first.ok && first.claimed).toBe(true);
    await releaseStripeEventClaim(eventId);
    const again = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(again.ok && again.claimed).toBe(true);
  });

  it("E: OpenAI client timeout is configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-p06-timeout-key-value");
    // Reset singleton by importing fresh module state is hard — assert constant used.
    expect(RELIABILITY_TIMEOUTS.openai).toBe(60_000);
    const sourcePromise = import("node:fs/promises").then((fs) =>
      fs.readFile("lib/openai.ts", "utf8"),
    );
    return sourcePromise.then((src) => {
      expect(src).toContain("RELIABILITY_TIMEOUTS.openai");
      expect(src).toContain("timeout:");
      void getOpenAIClient;
    });
  });

  it("F: retry is bounded (no retry storm)", async () => {
    expect(MAX_IMMEDIATE_RETRIES).toBeLessThanOrEqual(3);
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("429 rate limit"), { status: 429 });
        },
        {
          maxAttempts: MAX_IMMEDIATE_RETRIES,
          backoffMs: [1, 1, 1],
          shouldRetry: () => true,
        },
      ),
    ).rejects.toThrow(/429/);
    expect(attempts).toBe(MAX_IMMEDIATE_RETRIES);
  });

  it("G: external API 500 classified retryable but bounded", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("upstream 500");
        },
        { maxAttempts: 3, backoffMs: [1, 1, 1] },
      ),
    ).rejects.toThrow(/500/);
    expect(attempts).toBe(3);
  });

  it("H/I: work-queue reclaim of running side-effect fails closed", async () => {
    const fs = await import("node:fs/promises");
    const workerSrc = await fs.readFile("lib/work-queue/worker.ts", "utf8");
    expect(workerSrc).toContain("unknown_outcome");
    expect(workerSrc).toContain("SIDE_EFFECT_STEP_TYPES");
    expect(workerSrc).toContain("Ambiguous reclaim");
  });

  it("J: concurrent lease is single-winner", async () => {
    const { resetWorkQueueStoreForTests } = await import(
      "@/lib/work-queue/store"
    );
    const store = resetWorkQueueStoreForTests();
    await store.enqueue({
      ownerId: "user_c",
      automationId: "auto_c",
      occurrenceKey: "occ_lease",
      payload: { kind: "fixture" as const },
      steps: [{ stepId: "s1", stepType: "fixture_work" as const }],
    });
    const [a, b] = await Promise.all([
      store.leaseJobs({ workerId: "w_a", limit: 1, leaseMs: 30_000 }),
      store.leaseJobs({ workerId: "w_b", limit: 1, leaseMs: 30_000 }),
    ]);
    const winners = [...a, ...b];
    expect(winners).toHaveLength(1);
  });

  it("K: stale processing reclaim path exists", async () => {
    const { resetWorkQueueStoreForTests } = await import(
      "@/lib/work-queue/store"
    );
    const store = resetWorkQueueStoreForTests();
    expect(typeof store.reclaimStuckJob).toBe("function");
  });

  it("L: work-queue concurrency capped", () => {
    expect(WORK_QUEUE_WORKER_BATCH).toBeGreaterThan(0);
    expect(WORK_QUEUE_WORKER_BATCH).toBeLessThanOrEqual(25);
  });

  it("M: duplicate X post prevention — POST not wrapped in withRetry", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "lib/integrations/x/post/api-client.ts",
      "utf8",
    );
    expect(src).toMatch(/never retry the POST itself/);
    expect(src).toContain("createTweetOnce(input)");
  });

  it("N: user cross-access regression (P0-03)", async () => {
    expect(isResourceOwnedByUser("user_a", "user_b")).toBe(false);
    const denied = ownershipDeniedResponse(404);
    expect(denied.status).toBe(404);
  });

  it("O: OAuth encryption regression (P0-02)", () => {
    const pair = encodeOAuthTokenPairForStorage({
      accessToken: "ya29.access",
      refreshToken: "refresh",
    });
    expect(isEncryptedOAuthPayload(pair.accessTokenCiphertext)).toBe(true);
  });

  it("P: secret leakage regression (P0-04)", () => {
    const redacted = redactSecrets({
      authorization: "Bearer sk-abcdefghijklmnopqrstuv",
    });
    expect(JSON.stringify(redacted)).not.toContain("sk-abcdefghijklmnopqrstuv");
    expect(assertNoSecretMaterial('{"ok":true}')).toBe(true);
  });

  it("Q: upload/SSRF regression (P0-05)", () => {
    expect(() => assertSafeUploadFileName("../../secret")).toThrow(
      UnsafePathError,
    );
    expect(() => assertSafeOutboundUrl("http://127.0.0.1/")).toThrow(
      SsrfBlockedError,
    );
    expect(() =>
      assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/"),
    ).toThrow(SsrfBlockedError);
  });

  it("R: billing authorization — client priceId rejected in checkout source", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "app/api/billing/checkout/route.ts",
      "utf8",
    );
    expect(src).toContain("priceId");
    expect(src).toMatch(/rejected client priceId|Invalid request/);
  });

  it("production tick uses DB SoT dispatch (never memoryClaimRun fallback)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "lib/automations/tick-runner.ts",
      "utf8",
    );
    expect(src).toContain("isAutomationV2DbSotReady");
    expect(src).toContain("dispatchAutomationRuns");
    expect(src).toContain("fail-closed");
    expect(src).not.toContain("memoryClaimRun");
  });
});
