import { afterEach, describe, expect, it } from "vitest";

import { detectMotionLite, resolveMotionMode } from "@/lib/motion/android-lite";

type NavStub = {
  connection?: { saveData?: boolean; effectiveType?: string };
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
};

function stubWindow(nav: NavStub, width = 360) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: width,
      matchMedia: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        addEventListener() {},
        removeEventListener() {},
      }),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: nav.userAgent ?? "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,
      connection: nav.connection,
    },
  });
}

describe("detectMotionLite", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "navigator");
  });

  it("does not treat Android User-Agent or a typical 360px phone as lite", () => {
    stubWindow({ hardwareConcurrency: 8, deviceMemory: 8 }, 360);
    expect(detectMotionLite()).toBe(false);
  });

  it("does not treat 4-core / 4GB phones as lite", () => {
    stubWindow({ hardwareConcurrency: 4, deviceMemory: 4 }, 390);
    expect(detectMotionLite()).toBe(false);
  });

  it("does not read prefers-reduced-motion", () => {
    stubWindow({ hardwareConcurrency: 8, deviceMemory: 8 }, 360);
    expect(detectMotionLite()).toBe(false);
    expect(resolveMotionMode(false, true)).toBe("reduced");
    expect(resolveMotionMode(true, false)).toBe("lite");
    expect(resolveMotionMode(true, true)).toBe("reduced");
  });

  it("enables lite only for save-data, 2g, or extremely low cores and memory", () => {
    stubWindow({ connection: { saveData: true }, hardwareConcurrency: 8 }, 360);
    expect(detectMotionLite()).toBe(true);

    stubWindow(
      { connection: { effectiveType: "2g" }, hardwareConcurrency: 8 },
      390,
    );
    expect(detectMotionLite()).toBe(true);

    stubWindow({ hardwareConcurrency: 2, deviceMemory: 2 }, 412);
    expect(detectMotionLite()).toBe(true);

    stubWindow({ hardwareConcurrency: 2, deviceMemory: 8 }, 360);
    expect(detectMotionLite()).toBe(false);
  });
});
