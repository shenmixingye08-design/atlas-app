import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  consumeCompletionMotion,
  consumeSessionMotion,
  hasPlayedCompletion,
  hasPlayedSessionMotion,
} from "@/lib/motion/play-once";
import { MOTION_PLAY_KEYS } from "@/lib/motion/tokens";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("motion play-once", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: memoryStorage(),
        localStorage: memoryStorage(),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("plays home intro only once per session", () => {
    expect(consumeSessionMotion(MOTION_PLAY_KEYS.homeIntro)).toBe(true);
    expect(hasPlayedSessionMotion(MOTION_PLAY_KEYS.homeIntro)).toBe(true);
    expect(consumeSessionMotion(MOTION_PLAY_KEYS.homeIntro)).toBe(false);
  });

  it("plays a completion celebration only once per id", () => {
    expect(consumeCompletionMotion("job-1")).toBe(true);
    expect(hasPlayedCompletion("job-1")).toBe(true);
    expect(consumeCompletionMotion("job-1")).toBe(false);
    expect(consumeCompletionMotion("job-2")).toBe(true);
  });

  it("does not play completion without an id", () => {
    expect(consumeCompletionMotion("")).toBe(false);
  });
});
