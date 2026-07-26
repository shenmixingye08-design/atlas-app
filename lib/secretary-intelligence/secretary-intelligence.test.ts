import { describe, expect, it, beforeEach } from "vitest";

import {
  analyzeSecretaryWork,
  checkRisk,
  decideResearch,
  generateQuestions,
  resetSecretaryIntelligenceForTests,
  resolveAutonomyLevel,
} from "@/lib/secretary-intelligence";

describe("Secretary Intelligence Core", () => {
  beforeEach(() => {
    resetSecretaryIntelligenceForTests();
  });

  it("extracts intent for landowner sales request", () => {
    const plan = analyzeSecretaryWork({
      assignment: "地主さん向け営業資料お願い",
      autonomyLevel: 2,
    });
    expect(plan.intent.purpose).toBe("営業");
    expect(plan.intent.audience).toMatch(/地主/);
    expect(plan.intent.artifactHint).toMatch(/提案|営業/);
    expect(plan.extraLlmCalls).toBe(0);
  });

  it("plans executable tasks for sales materials", () => {
    const plan = analyzeSecretaryWork({
      assignment: "法人向けサービス提案の営業資料",
      hasBusinessProfile: true,
      autonomyLevel: 2,
    });
    const labels = plan.tasks.map((t) => t.label);
    expect(labels.some((l) => /会社情報|ナレッジ|構成|作成|品質/.test(l))).toBe(
      true,
    );
  });

  it("detects missing contract facts", () => {
    const plan = analyzeSecretaryWork({
      assignment: "業務委託契約書を作成して",
      autonomyLevel: 1,
    });
    const open = plan.missingInfo.filter((m) => !m.resolvedFromMemory);
    expect(open.some((m) => m.id === "term" || m.id === "amount")).toBe(true);
    expect(plan.questions.length).toBeGreaterThan(0);
  });

  it("does not ask when memory already has the fact", () => {
    const plan = analyzeSecretaryWork({
      assignment: "営業資料を作成",
      knownFacts: ["対象者は法人決裁者向けの提案です"],
      hasBusinessProfile: true,
      autonomyLevel: 1,
    });
    const audience = plan.missingInfo.find((m) => m.id === "audience");
    expect(audience?.resolvedFromMemory || !audience).toBeTruthy();
  });

  it("skips research for company intro sales", () => {
    const d = decideResearch({
      assignment: "会社紹介の営業資料",
      intent: analyzeSecretaryWork({
        assignment: "会社紹介の営業資料",
      }).intent,
    });
    expect(d.needed).toBe(false);
  });

  it("requires research for subsidy topics", () => {
    const d = decideResearch({
      assignment: "最新の補助金制度を調べて提案資料に反映",
      intent: analyzeSecretaryWork({
        assignment: "最新の補助金制度を調べて提案資料に反映",
      }).intent,
    });
    expect(d.needed).toBe(true);
  });

  it("maps risk for send/publish/delete/payment", () => {
    const send = checkRisk({
      assignment: "メールを送信して",
      autonomyLevel: 2,
    });
    expect(send.actions).toContain("send");
    expect(send.requiresConfirmation).toBe(true);

    const pay = checkRisk({
      assignment: "Stripeで決済して",
      autonomyLevel: 4,
    });
    expect(pay.actions).toContain("payment");
    expect(pay.requiresConfirmation).toBe(true);
  });

  it("autonomy levels change question and risk behavior", () => {
    expect(resolveAutonomyLevel(undefined, "suggest_only")).toBe(1);
    expect(resolveAutonomyLevel(undefined, "full_auto")).toBe(4);

    const l4 = analyzeSecretaryWork({
      assignment: "業務委託契約書を作成して",
      autonomyLevel: 4,
    });
    expect(l4.pauseForQuestions).toBe(false);
    expect(l4.questions.length).toBe(0);

    const l1 = analyzeSecretaryWork({
      assignment: "業務委託契約書を作成して",
      autonomyLevel: 1,
    });
    expect(l1.pauseForQuestions).toBe(true);
    expect(l1.questions.length).toBeGreaterThan(0);

    const l2 = analyzeSecretaryWork({
      assignment: "業務委託契約書を作成して",
      autonomyLevel: 2,
    });
    expect(l2.questions.length).toBeGreaterThan(0);
    expect(l2.pauseForQuestions).toBe(false);
  });

  it("user-facing copy never exposes internal AI structure", () => {
    const plan = analyzeSecretaryWork({
      assignment: "補助金の調査付き提案書",
      autonomyLevel: 2,
    });
    expect(plan.userFacing.headline).not.toMatch(/Planner|Writer|Judge|LLM/i);
    expect(plan.userFacing.detail).not.toMatch(/Planner|Writer|Judge|LLM/i);
    expect(plan.userFacing.headline).toMatch(/確認|整理|調べ/);
  });

  it("execution plan selects profile/knowledge/QE and research flag", () => {
    const plan = analyzeSecretaryWork({
      assignment: "法令の注意点を含む契約書",
      hasBusinessProfile: true,
      hasTemplate: true,
      autonomyLevel: 3,
    });
    expect(plan.executionPlan.useBusinessProfile).toBe(true);
    expect(plan.executionPlan.useQualityEngine).toBe(true);
    expect(plan.executionPlan.useWebResearch).toBe(true);
    expect(plan.extraLlmCalls).toBe(0);
  });

  it("question generator stays minimal", () => {
    const qs = generateQuestions({
      missing: [
        {
          id: "term",
          label: "契約期間",
          critical: true,
          resolvedFromMemory: false,
        },
        {
          id: "pages",
          label: "ページ数",
          critical: false,
          resolvedFromMemory: false,
        },
      ],
      autonomyLevel: 2,
    });
    expect(qs).toHaveLength(1);
    expect(qs[0]?.prompt).toContain("契約期間");
  });
});
