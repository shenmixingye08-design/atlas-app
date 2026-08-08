/**
 * X post path unit reliability under mocked HTTP (create + existence confirm + dedupe).
 * NOT a live Production X reliability certificate — HTTP is injected.
 * Opt-in via npm run test:reliability-1000 (excluded from default vitest).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTweet } from "@/lib/integrations/x/post/api-client";
import {
  getReliabilityMetricsSnapshot,
  resetReliabilityMetricsForTests,
} from "@/lib/reliability/metrics";
import { resetCircuitBreakersForTests } from "@/lib/reliability/circuit-breaker";

const RUNS = Number(process.env.X_POST_RUNS ?? 1000);

describe("x post reliability measured gate", () => {
  beforeEach(() => {
    resetReliabilityMetricsForTests();
    resetCircuitBreakersForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && url.includes("/2/tweets")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
          const id = `tw_${Buffer.from(body.text ?? "").toString("base64url")}`;
          return new Response(JSON.stringify({ data: { id, text: body.text } }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (method === "GET" && /\/2\/tweets\//.test(url)) {
          const id = url.split("/tweets/")[1]?.split("?")[0] ?? "missing";
          return new Response(
            JSON.stringify({ data: { id, text: "confirmed" } }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    `posts ${RUNS} times with confirm + dedupe`,
    async () => {
      let success = 0;
      let failure = 0;
      const ids = new Set<string>();

      for (let i = 1; i <= RUNS; i += 1) {
        try {
          const text = `reliability post ${i} ${Date.now()}`;
          const first = await createTweet({
            accessToken: "test-token",
            text,
          });
          // Duplicate must not create a second post.
          const second = await createTweet({
            accessToken: "test-token",
            text,
          });
          expect(second.tweetId).toBe(first.tweetId);
          ids.add(first.tweetId);
          success += 1;
        } catch {
          failure += 1;
        }
      }

      const snap = getReliabilityMetricsSnapshot();
      const rate = success / RUNS;
       
      console.log(
        JSON.stringify({
          runs: RUNS,
          success,
          failure,
          uniqueIds: ids.size,
          post_x: snap.buckets.post_x,
          rate,
        }),
      );

      expect(failure).toBe(0);
      expect(rate).toBeGreaterThanOrEqual(0.99);
      expect(ids.size).toBe(RUNS);
    },
    120_000,
  );
});
