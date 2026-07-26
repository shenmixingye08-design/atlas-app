import { describe, expect, it, beforeEach } from "vitest";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";

import { buildQualityContextPack } from "./context-pack";
import { applyFormatterToDeliverable } from "./formatter";
import { runRulesQualityJudge } from "./judge";
import {
  QUALITY_ENGINE_MAX_IMPROVE,
  QUALITY_JUDGE_PASS_SCORE,
  maxImproveRounds,
  resolveQualityEngineTier,
  resolveQualityPromptKind,
} from "./policy";
import { buildSectionedWriterPrompt } from "./prompts";
import { runRulesQualityReviewer } from "./reviewer";
import { getSectionsForKind } from "./sections";
import { resetQualityEngineTelemetryForTests } from "./telemetry-store";
import { buildWriterBrief } from "./writer-brief";

describe("quality engine policy", () => {
  it("keeps light deliverables on the fast path", () => {
    expect(
      resolveQualityEngineTier({
        deliverableType: "email",
        metadata: { costOptimization: { executionMode: "standard" } },
      }),
    ).toBe("fast");
    expect(
      resolveQualityEngineTier({
        deliverableType: "social_post",
        metadata: {},
      }),
    ).toBe("fast");
  });

  it("uses full tier for sales / proposal style work", () => {
    expect(
      resolveQualityEngineTier({
        deliverableType: "presentation",
        assignment: "営業資料を作成して",
        metadata: { costOptimization: { executionMode: "standard" } },
      }),
    ).toBe("full");
  });

  it("honors eco mode as fast", () => {
    expect(
      resolveQualityEngineTier({
        deliverableType: "report",
        metadata: { costOptimization: { executionMode: "eco" } },
      }),
    ).toBe("fast");
  });

  it("caps improve rounds and never exceeds 2", () => {
    expect(maxImproveRounds("fast")).toBe(0);
    expect(maxImproveRounds("enhanced")).toBe(1);
    expect(maxImproveRounds("full")).toBe(QUALITY_ENGINE_MAX_IMPROVE);
    expect(QUALITY_ENGINE_MAX_IMPROVE).toBe(2);
  });
});

describe("prompt kind + sections", () => {
  it("resolves dedicated kinds", () => {
    expect(
      resolveQualityPromptKind({
        assignment: "契約書を作って",
        deliverableType: "document",
      }),
    ).toBe("contract");
    expect(
      resolveQualityPromptKind({
        assignment: "請求書を発行",
        deliverableType: "document",
      }),
    ).toBe("invoice");
    expect(
      resolveQualityPromptKind({
        assignment: "ブログ記事",
        deliverableType: "blog",
      }),
    ).toBe("blog");
  });

  it("defines sales material chapter flow", () => {
    const titles = getSectionsForKind("sales_material").map((s) => s.title);
    expect(titles).toEqual([
      "表紙",
      "会社紹介",
      "課題",
      "提案内容",
      "メリット",
      "料金",
      "まとめ",
    ]);
  });

  it("builds sectioned writer prompt without AI role leakage to users", () => {
    const pack = buildQualityContextPack({
      metadata: { businessProfileSummary: "株式会社サンプル" },
    });
    const brief = buildWriterBrief({
      assignment: "営業資料を作成",
      deliverableType: "presentation",
      contextPack: pack,
    });
    const prompt = buildSectionedWriterPrompt({
      kind: "sales_material",
      tasks: [{ id: 1, title: "資料", description: "営業資料" }],
      brief,
      contextPack: pack,
    });
    expect(prompt).toContain("SECTION BY SECTION");
    expect(prompt).toContain("表紙");
    expect(prompt).toContain("Business Profile");
  });
});

describe("judge / reviewer / formatter", () => {
  beforeEach(() => {
    resetQualityEngineTelemetryForTests();
  });

  it("scores deliverables and uses 90 as pass threshold", () => {
    const deliverable = {
      ...emptyDeliverable("presentation"),
      title: "提案資料",
      summary: "顧客課題を解決する提案です。",
      content: "x".repeat(800),
      markdown: [
        "# 提案資料",
        "## 表紙",
        "概要",
        "## 会社紹介",
        "株式会社サンプル",
        "## 課題",
        "現状の課題。",
        "## 提案内容",
        "解決策。",
        "## メリット",
        "効果。",
        "## 料金",
        "要確認",
        "## まとめ",
        "次の一歩。",
      ].join("\n\n"),
    };

    const judge = runRulesQualityJudge({
      deliverable,
      kind: "sales_material",
      requiredSectionTitles: getSectionsForKind("sales_material").map(
        (s) => s.title,
      ),
      hasBusinessProfile: true,
    });

    expect(judge.overallScore).toBeGreaterThan(50);
    expect(QUALITY_JUDGE_PASS_SCORE).toBe(90);
    expect(Object.keys(judge.criteria)).toEqual(
      expect.arrayContaining([
        "completeness",
        "readability",
        "persuasiveness",
        "naturalness",
        "expertise",
        "design",
        "structure",
        "information",
      ]),
    );
  });

  it("flags placeholder issues in reviewer", () => {
    const deliverable = {
      ...emptyDeliverable("document"),
      title: "下書き",
      content: "TODO: ここに記入してください",
      markdown: "TODO: ここに記入してください",
    };
    const pack = buildQualityContextPack({});
    const brief = buildWriterBrief({
      assignment: "文書",
      deliverableType: "document",
      contextPack: pack,
    });
    const review = runRulesQualityReviewer({
      deliverable,
      kind: "generic",
      brief,
      contextPack: pack,
    });
    expect(review.approved).toBe(false);
    expect(review.issues.length).toBeGreaterThan(0);
  });

  it("formats markdown without LLM", () => {
    const deliverable = {
      ...emptyDeliverable("document"),
      title: "整える",
      content: "本文",
      markdown: "#タイトル\n\n\n\n本文",
    };
    const { deliverable: formatted } = applyFormatterToDeliverable(deliverable);
    expect(formatted.markdown).toContain("# タイトル");
    expect(formatted.markdown).not.toMatch(/\n{3,}/);
  });
});
