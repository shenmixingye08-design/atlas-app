import { afterEach, describe, expect, it, vi } from "vitest";

import {
  notifyBillingUsageChanged,
  subscribeBillingUsageChanged,
} from "./refresh-events";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);

// Node 20 ships EventTarget globally; provide a minimal CustomEvent shim only
// if the runtime lacks it so the module's dispatch call works under vitest.
if (typeof globalThis.CustomEvent === "undefined") {
  class CustomEventShim<T = unknown> extends Event implements CustomEvent<T> {
    readonly detail: T;

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = init && "detail" in init ? (init.detail as T) : (null as T);
    }

    initCustomEvent(): void {}
  }

  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    writable: true,
    value: CustomEventShim,
  });
}

function stubWindow(value: EventTarget | undefined): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreWindow(): void {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
}

describe("billing refresh events", () => {
  afterEach(() => {
    restoreWindow();
  });

  it("no-ops safely without a window (SSR)", () => {
    stubWindow(undefined);
    const unsubscribe = subscribeBillingUsageChanged(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => notifyBillingUsageChanged()).not.toThrow();
    unsubscribe();
  });

  it("notifies subscribers when usage changes and stops after unsubscribe", () => {
    stubWindow(new EventTarget());
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
