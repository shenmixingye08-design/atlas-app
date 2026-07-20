import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DEFAULT_PERSISTENCE_TIMEOUT_MS,
  withPersistenceTimeout,
} from "@/lib/persistence/with-timeout";

describe("withPersistenceTimeout", () => {
  it("returns the operation result when it settles in time", async () => {
    const result = await withPersistenceTimeout(async () => "ok", "fallback", 1000);
    expect(result).toBe("ok");
  });

  it("returns the fallback instead of hanging when the operation stalls", async () => {
    vi.useFakeTimers();
    try {
      const neverResolves = new Promise<string>(() => {});
      const promise = withPersistenceTimeout(() => neverResolves, "fallback", 8000);
      await vi.advanceTimersByTimeAsync(8000);
      await expect(promise).resolves.toBe("fallback");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes a bounded default ceiling", () => {
    expect(DEFAULT_PERSISTENCE_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
