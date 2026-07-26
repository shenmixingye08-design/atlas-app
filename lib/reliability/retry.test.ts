import { describe, expect, it, vi } from "vitest";

import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns on first success", async () => {
    const op = vi.fn(async () => "ok");
    await expect(withRetry(op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries timeout-like failures up to 3 times", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce("recovered");

    await expect(
      withRetry(op, { backoffMs: [1, 1, 1] }),
    ).resolves.toBe("recovered");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("does not retry auth failures", async () => {
    const op = vi.fn(async () => {
      throw new Error("unauthorized oauth");
    });
    await expect(withRetry(op, { backoffMs: [1, 1, 1] })).rejects.toThrow(
      /unauthorized/,
    );
    expect(op).toHaveBeenCalledTimes(1);
  });
});
