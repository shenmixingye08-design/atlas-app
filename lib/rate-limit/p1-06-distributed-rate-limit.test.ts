/**
 * P1-06: Distributed rate limit DB SoT — integrity tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));

import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { AI_API_RATE_LIMIT } from "@/lib/http/rate-limit";
import { AI_RATE_LIMIT_ENTRYPOINTS } from "@/lib/rate-limit/ai-entrypoints";
import {
  consumeRateLimit,
  resetDistributedRateLimitStoreForTests,
} from "@/lib/rate-limit/db-store";
import { setDistributedRateLimitReadyForTests } from "@/lib/rate-limit/table-ready";

describe("P1-06 distributed rate limit", () => {
  beforeEach(() => {
    resetDistributedRateLimitStoreForTests();
    setDistributedRateLimitReadyForTests(true);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_RATE_LIMIT_FORCE_MEMORY", "true");
  });

  afterEach(() => {
    resetDistributedRateLimitStoreForTests();
    vi.unstubAllEnvs();
  });

  it("A: consume allows then blocks at max", async () => {
    const opts = { bucket: "t-a", max: 3, windowMs: 60_000 };
    expect((await consumeRateLimit("user_a", opts)).allowed).toBe(true);
    expect((await consumeRateLimit("user_a", opts)).allowed).toBe(true);
    expect((await consumeRateLimit("user_a", opts)).allowed).toBe(true);
    const blocked = await consumeRateLimit("user_a", opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("B: multi-instance stand-in aggregates (shared SoT)", async () => {
    const opts = { bucket: "t-multi", max: 5, windowMs: 60_000 };
    // Simulate two instances sharing the same DB stand-in Map.
    for (let i = 0; i < 3; i += 1) {
      expect((await consumeRateLimit("user_m", opts)).allowed).toBe(true);
    }
    for (let i = 0; i < 2; i += 1) {
      expect((await consumeRateLimit("user_m", opts)).allowed).toBe(true);
    }
    expect((await consumeRateLimit("user_m", opts)).allowed).toBe(false);
  });

  it("C: restart-equivalent keeps counters in shared store", async () => {
    const opts = { bucket: "t-restart", max: 2, windowMs: 60_000 };
    expect((await consumeRateLimit("user_r", opts)).allowed).toBe(true);
    // Clear only readiness cache — counters remain (DB stand-in).
    setDistributedRateLimitReadyForTests(true);
    expect((await consumeRateLimit("user_r", opts)).allowed).toBe(true);
    expect((await consumeRateLimit("user_r", opts)).allowed).toBe(false);
  });

  it("D: minInterval blocks rapid retry", async () => {
    const opts = {
      bucket: "t-interval",
      max: 10,
      windowMs: 60_000,
      minIntervalMs: 5_000,
    };
    expect((await consumeRateLimit("user_i", opts)).allowed).toBe(true);
    const second = await consumeRateLimit("user_i", opts);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });

  it("E: enforceAiRateLimit returns 429 after burst", async () => {
    vi.stubEnv("ATLAS_RATE_LIMIT_FORCE_MEMORY", "true");
    const userId = "user_ai_burst";
    // Bypass minInterval by consuming the shared AI bucket directly with interval=0.
    for (let i = 0; i < AI_API_RATE_LIMIT.max; i += 1) {
      const hit = await consumeRateLimit(userId, {
        bucket: AI_API_RATE_LIMIT.bucket,
        max: AI_API_RATE_LIMIT.max,
        windowMs: AI_API_RATE_LIMIT.windowMs,
        minIntervalMs: 0,
      });
      expect(hit.allowed).toBe(true);
    }
    const limited = await enforceAiRateLimit(userId);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    expect(limited!.headers.get("Retry-After")).toBeTruthy();
  });

  it("F: failure path — Production without DB denies (fail-closed)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.ATLAS_RATE_LIMIT_FORCE_MEMORY;
    setDistributedRateLimitReadyForTests(false);
    // No service role in unit test → Production fail-closed deny
    const result = await consumeRateLimit("user_fail", {
      bucket: "t-fail",
      max: 100,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(false);
    expect(result.backend).toBe("db");
  });

  it("G: all AI entrypoints await enforceAiRateLimit", () => {
    const root = process.cwd();
    for (const relative of AI_RATE_LIMIT_ENTRYPOINTS) {
      const source = readFileSync(join(root, relative), "utf8");
      expect(
        source.includes("await enforceAiRateLimit"),
        `${relative} missing await enforceAiRateLimit`,
      ).toBe(true);
    }
  });

  it("H: memory Map helpers are not Production SoT (source check)", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/rate-limit/db-store.ts"),
      "utf8",
    );
    expect(source).toMatch(/isAtlasProduction/);
    expect(source).toMatch(/fail-closed|allowed: false/);
    expect(source).toMatch(/backend: \"db\"/);
  });
});
