import { afterEach, describe, expect, it, vi } from "vitest";

import {
  notifyBillingUsageChanged,
  subscribeBillingUsageChanged,
} from "./refresh-events";

type MutableGlobal = typeof globalThis & {
  window?: unknown;
  CustomEvent?: unknown;
};

const g = globalThis as MutableGlobal;
const originalWindow = g.window;

// Node 20 ships EventTarget globally; provide a minimal CustomEvent shim only
// if the runtime lacks it so the module's dispatch call works under vitest.
if (typeof g.CustomEvent === "undefined") {
  class CustomEventShim<T> extends Event {
    detail: T | null;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail ?? null;
    }
  }
  g.CustomEvent = CustomEventShim as unknown;
}

describe("billing refresh events", () => {
  afterEach(() => {
    g.window = originalWindow;
  });

  it("no-ops safely without a window (SSR)", () => {
    g.window = undefined;
    const unsubscribe = subscribeBillingUsageChanged(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => notifyBillingUsageChanged()).not.toThrow();
    unsubscribe();
  });

  it("notifies subscribers when usage changes and stops after unsubscribe", () => {
    g.window = new EventTarget();
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
