import { describe, expect, it } from "vitest";

import {
  buildXPostStepConfiguration,
  classifyXPostContent,
  extractQuotedOrAsIsPostText,
} from "@/lib/automation-platform/execution/x-post-content";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";

describe("classifyXPostContent", () => {
  it("Test 1: 文章を考えてXに投稿 → generate, not missing", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
    });
    expect(result.mode).toBe("generate");
    expect(result.topic).toBe("MINERVOT");
  });

  it("Test 2: 固定の『おはようございます』 → fixed", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "毎日『おはようございます』と投稿して",
    });
    expect(result.mode).toBe("fixed");
    expect(result.text).toBe("おはようございます");
  });

  it("keeps そのまま固定本文", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "今日は晴れです。をそのまま毎朝投稿して",
    });
    expect(result.mode).toBe("fixed");
    expect(result.text).toContain("今日は晴れです");
  });

  it("Test 3: 投稿内容を考えて即実行 → generate", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "毎日副業について投稿内容を考えて即実行して",
    });
    expect(result.mode).toBe("generate");
    expect(result.topic).toBe("副業");
  });

  it("Test 4: 考えて、投稿前に確認 → generate", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "毎日副業について投稿内容を考えて、投稿前に確認したい",
    });
    expect(result.mode).toBe("generate");
  });

  it("Test 5: これをXに投稿して with no referent → missing", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "これをXに投稿して",
    });
    expect(result.mode).toBe("missing");
    expect(result.reason).toBe("deictic_unresolved");
  });

  it("does not treat これについて考えて as missing", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "これについて考えてXに投稿して",
    });
    expect(result.mode).toBe("generate");
  });

  it("uses stored fixed text when no generate intent", () => {
    const result = classifyXPostContent({
      configuration: { text: "固定のひとこと" },
      freeformNotes: "毎朝Xに投稿して",
    });
    expect(result.mode).toBe("fixed");
    expect(result.text).toBe("固定のひとこと");
  });

  it("prefers generate over empty stored text for existing automations", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("generate");
  });

  it("honors contentSource=generate even if leftover text exists", () => {
    const result = classifyXPostContent({
      configuration: {
        contentSource: "generate",
        text: "昨日作った文",
        generateInstruction: "毎日副業について考えて投稿して",
      },
    });
    expect(result.mode).toBe("generate");
    expect(result.text).toBe("");
  });

  it("contentSource=generate with empty text/instruction is still generate", () => {
    const result = classifyXPostContent({
      configuration: { contentSource: "generate" },
      freeformNotes: "",
      description: "自然文からの提案です。内容を確認・修正してください。",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("generate");
    expect(result.text).toBe("");
  });

  it("topic-only configuration generates without a stored body", () => {
    const result = classifyXPostContent({
      configuration: { topic: "副業" },
      freeformNotes: "",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("generate");
    expect(result.topic).toBe("副業");
  });

  it("さっきの文章を投稿して with no referent is deictic missing", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "さっきの文章を投稿して",
    });
    expect(result.mode).toBe("missing");
    expect(result.reason).toBe("deictic_unresolved");
  });
});

describe("buildXPostStepConfiguration / wizard NL", () => {
  it("stores generate intent instead of empty required text", () => {
    const config = buildXPostStepConfiguration({
      sourceText: "毎日MINERVOTについて文章を考えてXに投稿して",
    });
    expect(config.contentSource).toBe("generate");
    expect(config.text).toBeUndefined();
    expect(config.generateInstruction).toContain("MINERVOT");
  });

  it("stores quoted fixed text on the x_post step", () => {
    const draft = proposeWizardFromNaturalLanguage(
      "毎日『おはようございます』と投稿して",
    );
    const step = draft.steps.find((item) => item.type === "x_post");
    expect(step?.configuration.contentSource).toBe("fixed");
    expect(step?.configuration.text).toBe("おはようございます");
    expect(draft.executionMode).toBe("run_then_notify");
  });

  it("sets review_before_run when the user asks to confirm", () => {
    const draft = proposeWizardFromNaturalLanguage(
      "毎日副業について投稿内容を考えて、投稿前に確認したい",
    );
    expect(draft.executionMode).toBe("review_before_run");
    const step = draft.steps.find((item) => item.type === "x_post");
    expect(step?.configuration.contentSource).toBe("generate");
  });

  it("does not treat これを投稿 as generate", () => {
    const draft = proposeWizardFromNaturalLanguage("これをXに投稿して");
    const step = draft.steps.find((item) => item.type === "x_post");
    expect(step?.configuration.contentSource).toBe("unresolved");
  });
});

describe("extractQuotedOrAsIsPostText", () => {
  it("reads 『』 quotes", () => {
    expect(extractQuotedOrAsIsPostText("毎日『おはようございます』と投稿して")).toBe(
      "おはようございます",
    );
  });
});
