import { describe, expect, it } from "vitest";

import { classifyXPostContent } from "@/lib/automation-platform/execution/x-post-content";
import {
  X_AUTOMATION_POST_ANGLES,
  X_AUTOMATION_POST_ANGLE_GUIDANCE,
  X_AUTOMATION_POST_CONFIRMED_FACTS,
  buildXAutomationPostFallbackText,
  buildXAutomationPostGenerationInput,
  buildXAutomationPostGenerationInstructions,
  deriveXAutomationPostAngleSeed,
  findForbiddenXPostClaims,
  isBrochureLikeXPost,
  selectXAutomationPostAngle,
} from "@/lib/automation-platform/execution/x-post-copy-quality";

const MINERVOT_X_REQUEST = "毎日MINERVOTについて文章を考えてXに投稿して";

const BAD_BROCHURE =
  "MINERVOTはお客様専属のAI秘書です。SNS投稿、自動化、メール、資料作成など様々な業務を効率化します。24時間対応でカスタマイズ可能です。まずはご希望をお聞かせください。";

describe("X automation copy quality rules", () => {
  it("classifies the production MINERVOT request as generate", () => {
    expect(
      classifyXPostContent({
        configuration: { contentSource: "generate" },
        freeformNotes: MINERVOT_X_REQUEST,
        automationName: "SNS投稿の自動化",
      }).mode,
    ).toBe("generate");
  });

  it("rotates angles instead of repeating one pitch", () => {
    const picked = new Set(
      X_AUTOMATION_POST_ANGLES.map((_, index) =>
        selectXAutomationPostAngle(index),
      ),
    );
    expect(picked.size).toBe(X_AUTOMATION_POST_ANGLES.length);
    expect(selectXAutomationPostAngle(0)).not.toBe(
      selectXAutomationPostAngle(1),
    );
  });

  it("derives a stable seed from runId so retries keep the same angle", () => {
    const first = deriveXAutomationPostAngleSeed({
      runId: "run_day_1",
      topic: "MINERVOT",
    });
    const second = deriveXAutomationPostAngleSeed({
      runId: "run_day_1",
      topic: "MINERVOT",
    });
    const other = deriveXAutomationPostAngleSeed({
      runId: "run_day_2",
      topic: "MINERVOT",
    });
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });

  it("keeps quality rules in the generation prompt", () => {
    const instructions = buildXAutomationPostGenerationInstructions();
    expect(instructions).toContain("1投稿1テーマ");
    expect(instructions).toContain("切り口を変える");
    expect(instructions).toContain("虚偽・誇張禁止");
    expect(instructions).toContain("24時間対応");
    expect(instructions).toContain("Memoryが無くても");
    expect(instructions).toContain("副業者専用");
    expect(instructions).toContain("60〜180文字");
    expect(instructions).toContain("まずはご希望をお聞かせください");
    expect(instructions).not.toContain("完全放置で何でも任せられます");
  });

  it("builds input with optional memory and recent posts", () => {
    const withoutMemory = buildXAutomationPostGenerationInput({
      automationName: "SNS投稿の自動化",
      topic: "MINERVOT",
      generateInstruction: MINERVOT_X_REQUEST,
      angle: "x_post_example",
    });
    expect(withoutMemory).toContain("文体メモリ: なし");
    expect(withoutMemory).toContain("今回の切り口: x_post_example");
    expect(withoutMemory).toContain(MINERVOT_X_REQUEST);

    const withMemory = buildXAutomationPostGenerationInput({
      automationName: "SNS投稿の自動化",
      topic: "MINERVOT",
      generateInstruction: MINERVOT_X_REQUEST,
      angle: "time_saved",
      memoryInjection: "短め。ですます調は控えめ。",
      recentTexts: ["MINERVOTはAI秘書です。ぜひ利用してください。"],
    });
    expect(withMemory).toContain("短め。ですます調は控えめ。");
    expect(withMemory).toContain("ぜひ利用してください");
    expect(withMemory).toContain("ほぼ同じ文章にしない");
  });

  it("flags brochure copy and forbidden claims", () => {
    expect(isBrochureLikeXPost(BAD_BROCHURE)).toBe(true);
    expect(findForbiddenXPostClaims(BAD_BROCHURE).length).toBeGreaterThan(0);
    expect(findForbiddenXPostClaims("完全放置で何でもできる。100%成功。")).toEqual(
      expect.arrayContaining([
        expect.stringContaining("完全放置"),
        expect.stringContaining("何でもできる"),
        expect.stringContaining("100"),
      ]),
    );
    expect(findForbiddenXPostClaims("副業者専用のツールです")).toHaveLength(1);
  });

  it("does not treat confirmed facts as invented claims", () => {
    const facts = X_AUTOMATION_POST_CONFIRMED_FACTS.join("\n");
    expect(findForbiddenXPostClaims(facts)).toEqual([]);
    expect(isBrochureLikeXPost(facts)).toBe(false);
  });
});

describe("same MINERVOT X automation — 5 virtual posts", () => {
  it("produces 5 distinct, natural, single-theme posts without false claims", () => {
    const classification = classifyXPostContent({
      configuration: { contentSource: "generate" },
      freeformNotes: MINERVOT_X_REQUEST,
      automationName: "SNS投稿の自動化",
    });
    expect(classification.mode).toBe("generate");

    const posts = [0, 1, 2, 3, 4].map((seed) => {
      const angle = selectXAutomationPostAngle(seed);
      const text = buildXAutomationPostFallbackText({
        angle,
        topic: classification.topic || "MINERVOT",
      });
      return { angle, text };
    });

    const texts = posts.map((post) => post.text);
    expect(new Set(texts).size).toBe(5);
    expect(new Set(posts.map((post) => post.angle)).size).toBe(5);

    for (const post of posts) {
      expect(post.text.length).toBeGreaterThanOrEqual(40);
      expect(post.text.length).toBeLessThanOrEqual(280);
      expect(findForbiddenXPostClaims(post.text)).toEqual([]);
      expect(isBrochureLikeXPost(post.text)).toBe(false);
      expect(post.text).not.toMatch(/かしこまりました|まずはご希望をお聞かせください/);
      expect(post.text).toMatch(/MINERVOT|X投稿|投稿|メール|予定|資料/);
      expect(X_AUTOMATION_POST_ANGLE_GUIDANCE[post.angle]).toBeTruthy();
    }

    // Not the same brochure pitch repeated with tiny edits.
    const normalized = texts.map((text) => text.replace(/\s+/g, ""));
    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        expect(normalized[i]).not.toBe(normalized[j]);
      }
    }
  });
});
