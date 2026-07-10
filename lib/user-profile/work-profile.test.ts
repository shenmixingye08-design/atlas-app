import { describe, expect, it, beforeEach, vi } from "vitest";

import { inferJobCategory } from "./categories";
import { formatLearnedSettingSummary } from "./labels";
import {
  recordJobUsage,
  recordAutomationCreated,
  getTopFrequentJobs,
  getFullAutoJobs,
} from "./learning";
import { resetUserWorkProfile, loadUserWorkProfile } from "./store";
import {
  applyWorkProfileToFormState,
  getSuggestionForText,
} from "./suggestions";
import { defaultAutomationFormState } from "@/lib/automations/form-utils";

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

describe("user work profile", () => {
  it("infers job categories from text", () => {
    expect(inferJobCategory("営業資料を作る")).toBe("sales_material");
    expect(inferJobCategory("毎週ブログ")).toBe("blog");
    expect(inferJobCategory("SNS投稿 18時")).toBe("sns_post");
  });

  it("learns sales material format preference", () => {
    recordJobUsage({
      text: "営業資料",
      preferredFormat: "pptx",
    });

    const suggestion = getSuggestionForText("営業資料");
    expect(suggestion?.summary).toContain("PowerPointのみ");
  });

  it("learns SNS full auto at 18:00", () => {
    recordJobUsage({
      text: "SNS投稿",
      executionLevel: "full_auto",
      preferredHour: 18,
      preferredMinute: 0,
      frequency: "daily",
    });

    const form = applyWorkProfileToFormState(
      defaultAutomationFormState({ title: "SNS投稿", assignment: "Xへ投稿" }),
    );

    expect(form.executionLevel).toBe("full_auto");
    expect(form.hour).toBe(18);
    expect(getFullAutoJobs(loadUserWorkProfile())).toContain("sns_post");
  });

  it("learns blog approval flow", () => {
    recordJobUsage({
      text: "毎週ブログ",
      executionLevel: "approve_then_run",
      frequency: "weekly",
    });

    const suggestion = getSuggestionForText("ブログ記事");
    expect(suggestion?.summary).toContain("確認後");
  });

  it("tracks frequently used jobs", () => {
    recordJobUsage({ text: "営業資料" });
    recordJobUsage({ text: "営業資料" });
    recordJobUsage({ text: "SNS投稿" });

    const top = getTopFrequentJobs(loadUserWorkProfile(), 2);
    expect(top[0]?.jobCategory).toBe("sales_material");
    expect(top[0]?.count).toBe(2);
  });

  it("records automation creation", () => {
    recordAutomationCreated({
      name: "SNS投稿",
      description: "desc",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 18, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 18:00",
      },
      workflow: { assignment: "Xへ投稿" },
      executionLevel: "full_auto",
    });

    const profile = loadUserWorkProfile();
    expect(formatLearnedSettingSummary(profile.jobSettings.sns_post!)).toContain(
      "18:00",
    );
  });
});
