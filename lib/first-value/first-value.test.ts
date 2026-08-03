import { beforeEach, describe, expect, it } from "vitest";

import {
  QUICK_START_PRESETS,
  buildQuickStartCreateHref,
  buildQuickStartTryNowHref,
  getQuickStartPreset,
} from "@/lib/first-value/quick-start-presets";
import {
  buildSecretaryRoi,
  estimateSavedMinutesFromCompletions,
} from "@/lib/first-value/roi";
import { computeSecretaryLevel } from "@/lib/first-value/secretary-level";
import { buildWorkCompletionItems } from "@/lib/first-value/work-completion";
import {
  listFirstValueEventsForTests,
  resetFirstValueAnalyticsForTests,
  trackFirstValueEvent,
} from "@/lib/first-value/analytics";

describe("first-value Quick Start presets", () => {
  it("exposes the six required empty-home CTAs", () => {
    const labels = QUICK_START_PRESETS.map((item) => item.label);
    expect(labels).toEqual([
      "営業資料を作る",
      "メールを書く",
      "レシート整理",
      "議事録作成",
      "請求書整理",
      "画像解析",
    ]);
  });

  it("builds create and try-now hrefs without scheduler wait", () => {
    const preset = getQuickStartPreset("sales_material");
    expect(preset).toBeTruthy();
    const create = buildQuickStartCreateHref(preset!);
    const tryNow = buildQuickStartTryNowHref(preset!);
    expect(create).toContain("/automations/new");
    expect(create).toContain("quickStart=sales_material");
    expect(tryNow).toContain("autostart=1");
    expect(tryNow).toContain("/workspace");
  });
});

describe("first-value ROI", () => {
  it("labels estimated vs measured distinctly", () => {
    const estimated = buildSecretaryRoi({
      todayMinutesSaved: 30,
      weekMinutesSaved: 120,
      monthMinutesSaved: 480,
      measured: false,
    });
    const measured = buildSecretaryRoi({
      todayMinutesSaved: 30,
      weekMinutesSaved: 120,
      monthMinutesSaved: 480,
      measured: true,
    });
    expect(estimated.basis).toBe("estimated");
    expect(measured.basis).toBe("measured");
    expect(estimated.label).toContain("推定");
    expect(measured.label).toContain("実測");
    expect(estimated.planPriceJpy).toBe(980);
    expect(estimated.monthHoursSaved).toBe(8);
  });

  it("estimates minutes from completions", () => {
    expect(estimateSavedMinutesFromCompletions(0)).toBe(0);
    expect(estimateSavedMinutesFromCompletions(2)).toBe(24);
  });
});

describe("first-value secretary level", () => {
  it("levels up with automations, hours, and memory", () => {
    const beginner = computeSecretaryLevel({
      automationCount: 0,
      hoursSaved: 0,
      memoryActiveCount: 0,
    });
    const advanced = computeSecretaryLevel({
      automationCount: 5,
      hoursSaved: 10,
      memoryActiveCount: 8,
    });
    expect(beginner.level).toBe(1);
    expect(advanced.level).toBeGreaterThan(beginner.level);
    expect(advanced.memoryCompletionRate).toBe(1);
  });
});

describe("first-value work completion list", () => {
  it("maps artifacts into finished-work steps not a file dump", () => {
    const items = buildWorkCompletionItems([
      {
        id: "1",
        title: "営業資料",
        detail: "PowerPoint + Dropbox保存",
        href: "/results/a",
        meta: "今日 10:00",
      },
      {
        id: "2",
        title: "X投稿",
        detail: "投稿完了",
        href: "/results/b",
        meta: "今日 11:00",
      },
    ]);
    expect(items[0]!.steps.some((s) => s.label === "成果物")).toBe(true);
    expect(items[0]!.steps.some((s) => s.label === "保存")).toBe(true);
    expect(items[1]!.steps.some((s) => s.label === "X投稿")).toBe(true);
    expect(items.every((item) => item.steps.every((s) => s.status === "completed"))).toBe(
      true,
    );
  });
});

describe("first-value analytics", () => {
  beforeEach(() => {
    resetFirstValueAnalyticsForTests();
  });

  it("records activation funnel events", () => {
    trackFirstValueEvent("empty_home_viewed");
    trackFirstValueEvent("quick_start_preset_clicked", { id: "email" });
    trackFirstValueEvent("automation_created", { id: "a1" });
    trackFirstValueEvent("first_try_now_clicked", { id: "a1" });
    trackFirstValueEvent("first_deliverable_ready", { id: "d1" });
    trackFirstValueEvent("first_download", { format: "docx" });
    const names = listFirstValueEventsForTests().map((e) => e.name);
    expect(names).toContain("empty_home_viewed");
    expect(names).toContain("automation_created");
    expect(names).toContain("first_try_now_clicked");
    expect(names).toContain("first_deliverable_ready");
    expect(names).toContain("first_download");
  });
});

describe("first-value notification policy", () => {
  it("allows work notifications and blocks ads", async () => {
    const { isSecretaryWorkNotification } = await import(
      "@/lib/first-value/notification-policy"
    );
    expect(
      isSecretaryWorkNotification({
        type: "completed",
        title: "成果物が完成しました",
        message: "営業資料の作成が完了しました",
      }),
    ).toBe(true);
    expect(
      isSecretaryWorkNotification({
        type: "automation",
        title: "Automation成功",
        message: "自動化が成功しました",
      }),
    ).toBe(true);
    expect(
      isSecretaryWorkNotification({
        type: "recommendation",
        title: "次はこれを自動化できます",
        message: "Memoryを改善して次回から任せられます",
      }),
    ).toBe(true);
    expect(
      isSecretaryWorkNotification({
        type: "billing",
        title: "今だけ割引キャンペーン",
        message: "アップグレードでお得",
      }),
    ).toBe(false);
    expect(
      isSecretaryWorkNotification({
        type: "recommendation",
        title: "限定オファー",
        message: "クーポンでセール中",
      }),
    ).toBe(false);
  });
});

describe("first-value quick start create payloads", () => {
  it("builds valid Automation create input for every preset", async () => {
    const { proposeWizardFromNaturalLanguage } = await import(
      "@/lib/automation-platform/wizard/nl-propose"
    );
    const { buildCreateInputFromWizard } = await import(
      "@/lib/automation-platform/wizard/builders"
    );
    for (const preset of QUICK_START_PRESETS) {
      const draft = proposeWizardFromNaturalLanguage(preset.workContent);
      draft.name = preset.title;
      draft.freeformNotes = preset.workContent;
      draft.frequency =
        preset.defaultFrequency === "once" ? "once" : preset.defaultFrequency;
      draft.triggerType =
        preset.defaultFrequency === "once" ? "manual" : "schedule";
      draft.activateOnCreate = true;
      const payload = buildCreateInputFromWizard(draft);
      expect(payload.errors, preset.id).toEqual([]);
    }
  });
});
