import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("@/lib/feature-flags", () => ({
  useFeatureAvailability: () => ({
    flags: {
      automation_v2_enabled: false,
      automation_operations_enabled: false,
      automation_dashboard_v2_enabled: false,
    },
    loading: false,
    error: null,
    reload: vi.fn(),
    isAvailable: () => false,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

import { AutomationFirstHome } from "@/components/automation-first/automation-first-home";
import {
  HOME_AUTOMATION_HREF,
  HOME_ONE_TIME_HREF,
} from "@/components/automation-first/home-primary-actions";
import type { Automation } from "@/lib/automations/types";

const FORBIDDEN_HOME_COPY = [
  "AIオーケストラ",
  "ジョブ",
  "Artifact",
  "Capability",
  "Workflow",
  "Automation Platform",
  "成果物生成エンジン",
  "成果物を作る",
  "新しい自動化を作る",
  "一度だけお願いする",
  "AI稼働中",
];

function sampleAutomation(): Automation {
  return {
    id: "a1",
    userId: "u1",
    name: "週次営業資料",
    description: "毎週の営業資料",
    enabled: true,
    status: "failed",
    schedule: {
      kind: "schedule",
      preset: { type: "weekly", dayOfWeek: 5, hour: 18, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎週金曜 18:00",
    },
    workflow: { assignment: "営業資料を作る" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: {
      templateId: "sales_material",
      steps: [{ id: "draft", enabled: true }],
    },
    destination: "none",
    lastRun: null,
    nextRun: "2026-08-07T09:00:00.000Z",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 1,
    runHistory: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function renderHome(automations: Automation[] = []) {
  return renderToStaticMarkup(
    React.createElement(AutomationFirstHome, {
      automations,
      projects: [],
    }),
  );
}

describe("MINERVOT home rendering", () => {
  it("leads with the two equal primary actions and user-purpose copy", () => {
    const html = renderHome();
    expect(html).toContain("automation-first-home");
    expect(html).toContain("MINERVOTに何を任せますか？");
    expect(html).toContain("今すぐ1件任せる");
    expect(html).toContain("繰り返し任せる");
    expect(html).toContain("今すぐお願いする");
    expect(html).toContain("自動化を作る");
    expect(html).toContain("まず1件任せてみましょう");
    expect(html).toContain("好みはMINERVOTが覚えて次回にも反映します");
    expect(html).toContain("Word");
    expect(html).toContain("Excel");
    expect(html).toContain("X投稿");
    expect(html).toContain("WordPress");
    const oneTimeIndex = html.indexOf("今すぐ1件任せる");
    const repeatIndex = html.indexOf("繰り返し任せる");
    const todayIndex = html.indexOf("今日のMINERVOT");
    expect(oneTimeIndex).toBeGreaterThan(0);
    expect(repeatIndex).toBeGreaterThan(oneTimeIndex);
    expect(todayIndex).toBe(-1);
    for (const term of FORBIDDEN_HOME_COPY) {
      expect(html).not.toContain(term);
    }
  });

  it("links one-time work to /workspace and repeating work to a filled request", () => {
    const html = renderHome();
    expect(HOME_ONE_TIME_HREF).toBe("/workspace");
    expect(HOME_AUTOMATION_HREF).toContain("/workspace?assignment=");
    expect(HOME_AUTOMATION_HREF).toContain(encodeURIComponent("毎朝8時にX投稿して"));
    expect(html).toContain(`href="${HOME_ONE_TIME_HREF}"`);
    expect(html).toContain(`href="${HOME_AUTOMATION_HREF}"`);
    expect(html.match(/href="\/workspace/g)?.length).toBeGreaterThan(1);
  });

  it("does not dump zero stats for a new user", () => {
    const html = renderHome();
    expect(html).not.toContain("0件");
    expect(html).not.toContain("0%");
    expect(html).not.toContain("今週の実績");
    expect(html).not.toContain("data-live");
  });

  it("keeps primary actions for returning users and strengthens today's work", () => {
    const html = renderHome([sampleAutomation()]);
    expect(html).toContain("今すぐ1件任せる");
    expect(html).toContain("繰り返し任せる");
    expect(html).toContain("今日のMINERVOT");
    expect(html).toContain("対応が必要");
    expect(html.indexOf("MINERVOTに何を任せますか？")).toBeLessThan(
      html.indexOf("今日のMINERVOT"),
    );
    expect(html.indexOf("今すぐ1件任せる")).toBeLessThan(
      html.indexOf("今日のMINERVOT"),
    );
  });
});

describe("MINERVOT home mobile layout regression", () => {
  it("stacks the two cards on small screens and keeps tap-sized CTAs", () => {
    const html = renderHome();
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("btn-brand");
    expect(html).toContain("min-h-[var(--touch-target)]");
    expect(html).toContain("flex-wrap");
    expect(html).not.toContain("overflow-x-scroll");
    expect(html).not.toContain("lg:hidden");
    expect(html).not.toContain("hidden gap-6 lg:grid");
  });
});
