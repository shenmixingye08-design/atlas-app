import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  completeOnboarding,
  deferOnboarding,
  resetOnboardingForRedo,
  seedProfileFromOnboarding,
  shouldShowWelcomeWizard,
  sortFrequentWorkPresets,
} from "@/lib/onboarding";
import { getTopFrequentJobs, resetUserWorkProfile } from "@/lib/user-profile";

const storage = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", { localStorage: localStorageMock });
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid",
});

beforeEach(() => {
  storage.clear();
  resetUserWorkProfile();
});

describe("onboarding", () => {
  it("shows welcome wizard for new users", () => {
    expect(shouldShowWelcomeWizard()).toBe(true);
  });

  it("hides welcome wizard after completion", () => {
    completeOnboarding({ preferredTasks: ["sns"], entryMode: "skip" });
    expect(shouldShowWelcomeWizard()).toBe(false);
  });

  it("keeps wizard available after deferring", () => {
    deferOnboarding();
    expect(shouldShowWelcomeWizard()).toBe(true);
  });

  it("seeds profile and stores preferred tasks", () => {
    seedProfileFromOnboarding(["sns", "blog"]);
    const profile = completeOnboarding({
      preferredTasks: ["sns", "blog"],
      entryMode: "guide",
    });

    expect(profile.onboarding?.completedOnboarding).toBe(true);
    expect(profile.onboarding?.preferredTasks).toEqual(["sns", "blog"]);
    expect(profile.onboarding?.createdAt).toBeTruthy();

    const frequent = getTopFrequentJobs(profile, 2);
    expect(frequent[0]?.jobCategory).toBe("sns_post");
  });

  it("sorts frequent work presets by onboarding preference", () => {
    const profile = completeOnboarding({
      preferredTasks: ["sales_material"],
      entryMode: "skip",
    });
    const presets = sortFrequentWorkPresets(profile);
    expect(presets[0]?.id).toBe("sales");
  });

  it("resets onboarding for redo from settings", () => {
    completeOnboarding({ preferredTasks: ["email"], entryMode: "skip" });
    resetOnboardingForRedo();
    expect(shouldShowWelcomeWizard()).toBe(true);
  });
});
