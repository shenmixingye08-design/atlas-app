import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXECUTION_STORAGE_KEY } from "./constants";
import { formatFailureReason, withExecutionRetry } from "./index";
import {
  appendExecutionLog,
  getExecutionState,
  startExecutionState,
  updateExecutionState,
} from "./store";

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
}

describe("execution reliability store", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists execution state and logs", () => {
    const started = startExecutionState({
      assignment: "ブログを書く",
      maxAttempts: 3,
      timeoutMs: 1000,
    });
    appendExecutionLog(started.id, {
      level: "info",
      message: "再試行します",
    });
    updateExecutionState(started.id, {
      phase: "completed",
      projectId: "commander-1",
      notificationGuaranteed: true,
    });

    const loaded = getExecutionState(started.id);
    expect(loaded?.phase).toBe("completed");
    expect(loaded?.projectId).toBe("commander-1");
    expect(loaded?.notificationGuaranteed).toBe(true);
    expect(loaded?.logs.some((entry) => entry.message.includes("再試行"))).toBe(
      true,
    );
    expect(localStorage.getItem(EXECUTION_STORAGE_KEY)).toBeTruthy();
  });
});

describe("withExecutionRetry", () => {
  it("retries transient failures then succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce("ok");

    const result = await withExecutionRetry(operation, {
      maxAttempts: 3,
      delayMs: 0,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry abort errors", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const operation = vi.fn().mockRejectedValue(abortError);

    await expect(
      withExecutionRetry(operation, { maxAttempts: 3, delayMs: 0 }),
    ).rejects.toBe(abortError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("formatFailureReason", () => {
  it("explains timeout clearly", () => {
    expect(formatFailureReason({ timedOut: true })).toContain("タイムアウト");
  });

  it("surfaces provided error text", () => {
    expect(formatFailureReason({ error: "投稿APIが失敗しました" })).toBe(
      "投稿APIが失敗しました",
    );
  });
});
