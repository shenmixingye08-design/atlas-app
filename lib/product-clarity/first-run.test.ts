import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeOnboarding } from "@/lib/onboarding";
import { completeFirstExperience } from "@/lib/first-experience";
import { resetUserWorkProfile } from "@/lib/user-profile";

import {
  isClarityFirstRun,
  shouldShowDeliverableFormatPicker,
  shouldShowXAutopostAdvancedControls,
} from "./first-run";

const storage = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});
vi.stubGlobal("window", { localStorage });
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

beforeEach(() => {
  storage.clear();
  resetUserWorkProfile();
});

describe("first-run clarity gates", () => {
  it("treats brand-new users as first-run", () => {
    expect(isClarityFirstRun()).toBe(true);
    expect(shouldShowDeliverableFormatPicker()).toBe(false);
    expect(shouldShowXAutopostAdvancedControls()).toBe(false);
  });

  it("keeps advanced controls hidden until first experience completes", () => {
    completeOnboarding({ preferredTasks: ["sns"], entryMode: "guide" });
    expect(isClarityFirstRun()).toBe(true);
    expect(shouldShowDeliverableFormatPicker()).toBe(false);
  });

  it("reveals format picker after first success", () => {
    completeOnboarding({ preferredTasks: ["sns"], entryMode: "guide" });
    completeFirstExperience({
      taskId: "sns",
      jobCategory: "sns_post",
      durationSec: 40,
      deliverable: {
        title: "SNS投稿文",
        preview: "test",
        format: "テキスト",
      },
      leadEmployee: "MINERVOT",
      saveLocation: "MINERVOT",
      nextIntegration: { label: "X", href: "/settings/x" },
      usedRealOrchestration: false,
    });
    expect(isClarityFirstRun()).toBe(false);
    expect(shouldShowDeliverableFormatPicker()).toBe(true);
  });
});
