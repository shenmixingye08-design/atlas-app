import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  notifyBillingUsageChanged,
  subscribeBillingUsageChanged,
} from "./refresh-events";

// Node 20 ships EventTarget globally; provide a minimal CustomEvent shim only
// if the runtime lacks it so the module's dispatch call works under vitest.
class CustomEventShim<T> extends Event {
  detail: T | null;
  constructor(type: string, init?: { detail?: T }) {
    super(type);
    this.detail = init?.detail ?? null;
  }
}

describe("billing refresh events", () => {
  beforeEach(() => {
    if (typeof globalThis.CustomEvent === "undefined") {
      vi.stubGlobal("CustomEvent", CustomEventShim);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops safely without a window (SSR)", () => {
    vi.stubGlobal("window", undefined);
    const unsubscribe = subscribeBillingUsageChanged(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => notifyBillingUsageChanged()).not.toThrow();
    unsubscribe();
  });

  it("notifies subscribers when usage changes and stops after unsubscribe", () => {
    vi.stubGlobal("window", new EventTarget());
    const handler = vi.fn();
    const unsubscribe = subscribeBillingUsageChanged(handler);

    notifyBillingUsageChanged();
    expect(handler).toHaveBeenCalledTimes(1);

    notifyBillingUsageChanged();
    expect(handler).toHaveBeenCalledTimes(2);

    unsubscribe();
    notifyBillingUsageChanged();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
