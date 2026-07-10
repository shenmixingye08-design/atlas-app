import { describe, expect, it, beforeEach, vi } from "vitest";

import { completeOnboarding } from "@/lib/onboarding";
import {
  completeFirstExperience,
  deferFirstExperience,
  shouldShowFirstExperience,
  shouldShowFirstExperienceCard,
} from "@/lib/first-experience";
import { resetUserWorkProfile } from "@/lib/user-profile";

const storage = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});
vi.stubGlobal("window", { localStorage: localStorage });
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

beforeEach(() => {
  storage.clear();
  resetUserWorkProfile();
});

describe("first experience", () => {
  it("shows after onboarding when not completed", () => {
    completeOnboarding({ preferredTasks: ["sns"], entryMode: "skip" });
    expect(shouldShowFirstExperience()).toBe(true);
    expect(shouldShowFirstExperienceCard()).toBe(true);
  });

  it("hides overlay after defer but keeps home card", () => {
    completeOnboarding({ preferredTasks: ["sns"], entryMode: "skip" });
    deferFirstExperience();
    expect(shouldShowFirstExperience()).toBe(false);
    expect(shouldShowFirstExperienceCard()).toBe(true);
  });

  it("hides after completion", () => {
    completeOnboarding({ preferredTasks: ["blog"], entryMode: "guide" });
    completeFirstExperience({
      taskId: "blog",
      jobCategory: "blog",
      durationSec: 42,
      deliverable: {
        title: "ブログ下書き",
        preview: "test",
        format: "Markdown",
      },
      leadEmployee: "ブログ担当",
      saveLocation: "ATLAS",
      nextIntegration: { label: "WordPress", href: "/settings" },
      usedRealOrchestration: false,
    });
    expect(shouldShowFirstExperience()).toBe(false);
    expect(shouldShowFirstExperienceCard()).toBe(false);
  });
});
