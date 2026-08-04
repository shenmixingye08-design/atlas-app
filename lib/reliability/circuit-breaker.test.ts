import { beforeEach, describe, expect, it } from "vitest";

import {
  assertCircuitClosed,
  getCircuitState,
  recordCircuitFailure,
  recordCircuitSuccess,
  resetCircuitBreakersForTests,
  withCircuitBreaker,
} from "./circuit-breaker";

describe("circuit breaker", () => {
  beforeEach(() => {
    resetCircuitBreakersForTests();
  });

  it("opens after failure threshold and blocks calls", async () => {
    for (let i = 0; i < 5; i += 1) {
      recordCircuitFailure("openai");
    }
    expect(getCircuitState("openai")).toBe("open");
    expect(() => assertCircuitClosed("openai")).toThrow(/circuit_open/);
  });

  it("records success path through withCircuitBreaker", async () => {
    const value = await withCircuitBreaker("x", async () => 42);
    expect(value).toBe(42);
    expect(getCircuitState("x")).toBe("closed");
  });

  it("counts failures inside withCircuitBreaker", async () => {
    await expect(
      withCircuitBreaker("line", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    recordCircuitSuccess("line");
    expect(getCircuitState("line")).toBe("closed");
  });
});
