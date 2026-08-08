/**
 * P1-09: Reliability test integrity — CI-mandatory.
 *
 * Proves fake/hard-coded success is gone, real execution paths run,
 * failure injection behaves, and negative cases actually fail.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  claimStripeEventForProcessing,
  hasProcessedStripeEvent,
  resetProcessedStripeEvents,
} from "@/lib/billing/stripe/webhook-idempotency";
import { isResourceOwnedByUser } from "@/lib/auth/ownership";
import { createTweet } from "@/lib/integrations/x/post/api-client";
import {
  claimDueDeliveryRetry,
  resetDurableInboxForTests,
  scheduleDurableDeliveryRetry,
} from "@/lib/notifications/durable-inbox";
import { processDurableNotificationRetries } from "@/lib/notifications/retry-drain";
import { createUserNotification } from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import {
  MAX_IMMEDIATE_RETRIES,
  withRetry,
} from "@/lib/reliability/retry";
import {
  getReliabilityMetricsSnapshot,
  resetReliabilityMetricsForTests,
} from "@/lib/reliability/metrics";
import { resetCircuitBreakersForTests } from "@/lib/reliability/circuit-breaker";
import {
  executeIdempotentSideEffect,
  resetSideEffectStoreForTests,
} from "@/lib/side-effects";
import { resetWorkQueueStoreForTests } from "@/lib/work-queue/store";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P1-09 reliability test integrity", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    resetReliabilityMetricsForTests();
    resetCircuitBreakersForTests();
    resetSideEffectStoreForTests();
    resetNotificationStore();
    resetDurableInboxForTests();
    resetProcessedStripeEvents();
    resetWorkQueueStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("A: reliability harnesses contain no fabricated post/timeout success", () => {
    for (const rel of [
      "lib/reliability/e2e-1000.test.ts",
      "scripts/reliability-e2e-1000.ts",
    ]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/postSuccessRate\s*:\s*1\b/);
      expect(src).not.toMatch(/timeoutRate\s*:\s*0\b/);
      // Forbidden call shape without embedding it as a live call in this file.
      const invented =
        /recordReliabilityEvent\s*\(\s*(["'])post_x\1\s*,\s*(["'])success\2/.test(
          src,
        );
      expect(invented).toBe(false);
      expect(src).not.toMatch(/scoreHint:\s*gatePass\s*\?\s*96/);
    }
    const p06 = readSrc("lib/reliability/p06-e2e-ops-verification.test.ts");
    expect(p06).not.toMatch(
      /function assertProgressStages[\s\S]*?trail\.push\(msg\)/,
    );
  });

  it("B: real paths — work-queue uniqueness + side-effect + notify retry claim", async () => {
    const store = resetWorkQueueStoreForTests();
    const first = await store.enqueue({
      ownerId: "user_p109_a",
      automationId: "auto_p109",
      occurrenceKey: "occ_p109",
      payload: { kind: "fixture" as const },
      steps: [{ stepId: "s1", stepType: "fixture_work" as const }],
    });
    const second = await store.enqueue({
      ownerId: "user_p109_a",
      automationId: "auto_p109",
      occurrenceKey: "occ_p109",
      payload: { kind: "fixture" as const },
      steps: [{ stepId: "s1", stepType: "fixture_work" as const }],
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    let calls = 0;
    const ctx = {
      userId: "user_p109_a",
      provider: "notification" as const,
      actionType: "notify" as const,
      destination: "line",
      automationId: "auto_p109",
      runId: "run_p109",
      occurrenceKey: "occ_side",
      discriminator: "once",
    };
    await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return {
        providerResourceId: "p109_side_1",
        result: { ok: true as const },
      };
    });
    await executeIdempotentSideEffect(ctx, async () => {
      calls += 1;
      return {
        providerResourceId: "p109_side_2",
        result: { ok: true as const },
      };
    });
    expect(calls).toBe(1);

    const ntf = await createUserNotification(
      {
        audience: "user",
        userId: "user_p109_a",
        type: "automation",
        title: "p109",
        message: "retry",
        requestId: "req_p109_retry",
        lineEvent: "automation_completed",
      },
      { skipDelivery: true },
    );
    expect(ntf?.notificationId).toBeTruthy();
    await scheduleDurableDeliveryRetry({
      notificationId: ntf!.notificationId,
      ownerId: "user_p109_a",
      errorMessage: "p109_seed",
      delayMs: 0,
    });
    const claimed = await claimDueDeliveryRetry({
      notificationId: ntf!.notificationId,
      ownerId: "user_p109_a",
      leaseOwner: "p109",
      nowMs: Date.now() + 1000,
    });
    expect(claimed?.ownerId).toBe("user_p109_a");
  });

  it("C/D/E: timeout / 429 / 500 use bounded withRetry then fail", async () => {
    for (const label of ["timeout", "429", "500"] as const) {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts += 1;
            if (label === "timeout") throw new Error("ETIMEDOUT upstream");
            if (label === "429") throw new Error("HTTP 429 rate limited");
            throw new Error("HTTP 500 server error");
          },
          { maxAttempts: MAX_IMMEDIATE_RETRIES, backoffMs: [1, 1, 1] },
        ),
      ).rejects.toThrow(/ETIMEDOUT|429|500/);
      expect(attempts).toBe(MAX_IMMEDIATE_RETRIES);
    }
  });

  it("F: duplicate Stripe webhook claim is single-winner", async () => {
    const eventId = "evt_p109_dup";
    const a = await claimStripeEventForProcessing(eventId);
    const b = await claimStripeEventForProcessing(eventId);
    expect(a).toEqual({ ok: true, claimed: true });
    expect(a.ok && a.claimed).toBe(true);
    expect(b.ok && b.claimed).toBe(false);
    expect(await hasProcessedStripeEvent(eventId)).toBe(false);
  });

  it("G: work-queue stale lease reclaim is single-winner", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue({
      ownerId: "user_p109_b",
      automationId: "auto_reclaim",
      occurrenceKey: "occ_reclaim",
      payload: { kind: "fixture" as const },
      steps: [{ stepId: "s1", stepType: "fixture_work" as const }],
    });
    await store.leaseJobs({ workerId: "worker_dead", limit: 1, leaseMs: 1 });
    await store.updateJob(job.jobId, {
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
      status: "leased",
      leaseOwner: "worker_dead",
    });
    const reclaimed = await store.leaseJobs({
      workerId: "worker_rescue",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.jobId).toBe(job.jobId);
    expect(reclaimed[0]?.leaseOwner).toBe("worker_rescue");
  });

  it("H: DB/storage failure classification retries then surfaces failure", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("supabase database connection failed");
        },
        { maxAttempts: 3, backoffMs: [1, 1, 1] },
      ),
    ).rejects.toThrow(/database|supabase/i);
    expect(attempts).toBe(3);
  });

  it("I: cross-user isolation — B cannot claim A notification retry", async () => {
    const ntf = await createUserNotification(
      {
        audience: "user",
        userId: "user_p109_owner",
        type: "automation",
        title: "own",
        message: "m",
        requestId: "req_p109_owner",
        lineEvent: "automation_completed",
      },
      { skipDelivery: true },
    );
    await scheduleDurableDeliveryRetry({
      notificationId: ntf!.notificationId,
      ownerId: "user_p109_owner",
      errorMessage: "x",
      delayMs: 0,
    });
    const stolen = await claimDueDeliveryRetry({
      notificationId: ntf!.notificationId,
      ownerId: "user_p109_evil",
      leaseOwner: "evil",
      nowMs: Date.now() + 1000,
    });
    expect(stolen).toBeNull();
    expect(isResourceOwnedByUser("user_p109_owner", "user_p109_evil")).toBe(
      false,
    );
  });

  it("J: negative — intentional hard failure must not be reported as success", async () => {
    const drain = await processDurableNotificationRetries({
      limit: 5,
      nowMs: Date.now(),
      leaseOwner: "p109_neg",
      forceDeliveryFailureForOwner: "__nobody__",
    });
    expect(drain.dlqReinjected).toBe(0);
    expect(drain.delivered + drain.deadLettered).toBe(0);

    let executed = 0;
    await expect(
      withRetry(
        async () => {
          executed += 1;
          throw new Error("non_retryable_validation_error");
        },
        {
          maxAttempts: 3,
          backoffMs: [1, 1, 1],
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow(/non_retryable/);
    expect(executed).toBe(1);

    // X POST is fail-closed on 500 (no soft-success, no invented marker).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("fail", { status: 500 })),
    );
    await expect(
      createTweet({ accessToken: "tok", text: `p109 neg ${Date.now()}` }),
    ).rejects.toThrow();
    const snap = getReliabilityMetricsSnapshot();
    expect(snap.buckets.post_x.failure).toBeGreaterThanOrEqual(1);
    expect(snap.buckets.post_x.success).toBe(0);
  });

  it("K: createTweet success only after create+confirm HTTP path", async () => {
    let posts = 0;
    let confirms = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url.includes("/2/tweets")) {
          posts += 1;
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            text?: string;
          };
          return new Response(
            JSON.stringify({ data: { id: "tw_p109", text: body.text } }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        if (method === "GET" && /\/2\/tweets\//.test(url)) {
          confirms += 1;
          return new Response(
            JSON.stringify({ data: { id: "tw_p109", text: "ok" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("no", { status: 404 });
      }),
    );
    const text = `p109 ok ${Date.now()}`;
    const result = await createTweet({ accessToken: "tok", text });
    expect(result.tweetId).toBe("tw_p109");
    expect(posts).toBe(1);
    expect(confirms).toBeGreaterThanOrEqual(1);
    // Dedupe: second identical text must not POST again.
    const again = await createTweet({ accessToken: "tok", text });
    expect(again.tweetId).toBe("tw_p109");
    expect(posts).toBe(1);
    const snap = getReliabilityMetricsSnapshot();
    expect(snap.buckets.post_x.success).toBeGreaterThanOrEqual(1);
  });
});
