import { describe, expect, it, beforeEach } from "vitest";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";

import { buildQualityKindStats } from "./analytics";
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
import { buildSectionedWriterPrompt, buildQualityReviewerPrompt } from "./prompts";
import { buildReferenceInsights } from "./reference-engine";
import { runRulesQualityReviewer } from "./reviewer";
import { getSectionsForKind } from "./sections";
import { getSpecialistProfile } from "./specialists";
import {
  recordQualityEngineTelemetry,
  resetQualityEngineTelemetryForTests,
  listQualityEngineTelemetry,
} from "./telemetry-store";
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

describe("specialist kinds + sections", () => {
  it("resolves dedicated kinds including phase2", () => {
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
        assignment: "見積書を作成",
        deliverableType: "document",
      }),
    ).toBe("estimate");
    expect(
      resolveQualityPromptKind({
        assignment: "企画書をまとめて",
        deliverableType: "document",
      }),
    ).toBe("planning");
    expect(
      resolveQualityPromptKind({
        assignment: "議事録を書いて",
        deliverableType: "document",
      }),
    ).toBe("minutes");
    expect(
      resolveQualityPromptKind({
        assignment: "お礼メールを作成",
        deliverableType: "email",
      }),
    ).toBe("email");
    expect(
      resolveQualityPromptKind({
        assignment: "ブログ記事",
        deliverableType: "blog",
      }),
    ).toBe("blog");
  });

  it("defines sales material chapter flow with CTA", () => {
    const titles = getSectionsForKind("sales_material").map((s) => s.title);
    expect(titles).toEqual([
      "表紙",
      "会社紹介",
      "課題",
      "提案内容",
      "メリット",
      "料金",
      "まとめ・CTA",
    ]);
  });

  it("registers specialist profiles with distinct judge focus", () => {
    expect(getSpecialistProfile("sales_material").judgeFocus).toBe("営業力");
    expect(getSpecialistProfile("blog").judgeFocus).toBe("SEO");
    expect(getSpecialistProfile("contract").judgeFocus).toBe("整合性");
    expect(getSpecialistProfile("excel").judgeFocus).toBe("実用性");
    expect(getSpecialistProfile("email").judgeFocus).toBe("返信しやすさ");
  });

  it("builds specialist writer/reviewer prompts", () => {
    const pack = buildQualityContextPack({
      metadata: { businessProfileSummary: "株式会社サンプル" },
    });
    const brief = buildWriterBrief({
      assignment: "営業資料を作成",
      deliverableType: "presentation",
      contextPack: pack,
    });
    const writer = buildSectionedWriterPrompt({
      kind: "sales_material",
      tasks: [{ id: 1, title: "資料", description: "営業資料" }],
      brief,
      contextPack: pack,
    });
    expect(writer).toContain("営業資料AI");
    expect(writer).toContain("課題→解決→メリット→CTA");
    expect(writer).toContain("SECTION BY SECTION");

    const reviewer = buildQualityReviewerPrompt({
      kind: "blog",
      markdown: "## 導入\n本文",
      brief,
      contextPack: pack,
    });
    expect(reviewer).toContain("ブログAI");
    expect(reviewer).toContain("SEO");
  });
});

describe("reference engine", () => {
  it("extracts reference hints from attachments without copying", () => {
    const insights = buildReferenceInsights({
      attachments: [
        {
          name: "sample-deck.pdf",
          kind: "pdf",
          mimeType: "application/pdf",
        },
        {
          name: "logo.png",
          kind: "image",
          mimeType: "image/png",
        },
        {
          name: "data.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
      visionAnalysis: "青い基調の資料",
    });
    expect(insights.hasReferences).toBe(true);
    expect(insights.attachmentCount).toBe(3);
    expect(insights.summary).toContain("コピー禁止");
    expect(insights.summary).toContain("構成");
    expect(insights.kinds).toEqual(
      expect.arrayContaining(["pdf", "image", "excel"]),
    );
  });
});

describe("judge / reviewer / formatter", () => {
  beforeEach(() => {
    resetQualityEngineTelemetryForTests();
  });

  it("scores deliverables with specialist focus and 90 pass threshold", () => {
    const deliverable = {
      ...emptyDeliverable("presentation"),
      title: "提案資料",
      summary: "顧客課題を解決する提案です。",
      content: "x".repeat(800),
      markdown: [
        "# 提案資料",
        "## 表紙",
        "興味を引く一言",
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
        "## まとめ・CTA",
        "ご相談ください。",
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

    expect(judge.focus).toBe("営業力");
    expect(judge.overallScore).toBeGreaterThan(50);
    expect(QUALITY_JUDGE_PASS_SCORE).toBe(90);
    expect(judge.feedback).toContain("営業力");
  });

  it("uses contract specialist reviewer checks", () => {
    const deliverable = {
      ...emptyDeliverable("document"),
      title: "契約書案",
      content: "簡単な契約の文章だけ",
      markdown: "# 契約\n\n簡単な契約の文章だけ",
    };
    const pack = buildQualityContextPack({});
    const brief = buildWriterBrief({
      assignment: "契約書",
      deliverableType: "document",
      contextPack: pack,
    });
    const review = runRulesQualityReviewer({
      deliverable,
      kind: "contract",
      brief,
      contextPack: pack,
    });
    expect(review.specialistLabel).toBe("契約書AI");
    expect(review.approved).toBe(false);
    expect(review.issues.some((i) => /条項/.test(i))).toBe(true);
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

  it("aggregates owner stats by kind", () => {
    recordQualityEngineTelemetry({
      tier: "full",
      promptKind: "sales_material",
      specialistLabel: "営業資料AI",
      improveCount: 2,
      reviewerCount: 2,
      finalScore: 88,
      judgeFocus: "営業力",
      passed: false,
      timings: {
        plannerMs: 10,
        writerMs: 20,
        reviewerMs: 5,
        judgeMs: 5,
        formatterMs: 1,
        improveMs: 10,
      },
      reviewerUsedLlm: true,
      judgeSource: "rules",
      recordedAt: new Date().toISOString(),
      userId: "u1",
      assignmentHint: "営業資料",
    });
    recordQualityEngineTelemetry({
      tier: "enhanced",
      promptKind: "blog",
      specialistLabel: "ブログAI",
      improveCount: 0,
      reviewerCount: 1,
      finalScore: 92,
      judgeFocus: "SEO",
      passed: true,
      timings: {
        plannerMs: 8,
        writerMs: 15,
        reviewerMs: 4,
        judgeMs: 3,
        formatterMs: 1,
        improveMs: 0,
      },
      reviewerUsedLlm: false,
      judgeSource: "rules",
      recordedAt: new Date().toISOString(),
      userId: "u1",
      assignmentHint: "ブログ",
    });

    const stats = buildQualityKindStats(listQualityEngineTelemetry(50));
    const sales = stats.find((s) => s.promptKind === "sales_material");
    const blog = stats.find((s) => s.promptKind === "blog");
    expect(sales?.avgScore).toBe(88);
    expect(sales?.avgImproveCount).toBe(2);
    expect(sales?.avgReviewerCount).toBe(2);
    expect(blog?.avgScore).toBe(92);
    expect(blog?.specialistLabel).toBe("ブログAI");
  });
});
