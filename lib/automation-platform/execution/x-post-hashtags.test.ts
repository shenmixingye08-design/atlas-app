import { describe, expect, it } from "vitest";

import { classifyXPostContent } from "@/lib/automation-platform/execution/x-post-content";
import {
  buildXAutomationPostFallbackText,
  findForbiddenXPostClaims,
  isBrochureLikeXPost,
  selectXAutomationPostAngle,
} from "@/lib/automation-platform/execution/x-post-copy-quality";
import {
  allowsFixedTextHashtagAuto,
  applyXAutomationPostHashtags,
  attachXPostHashtags,
  extractXPostHashtags,
  isUnrelatedXPostHashtag,
  parseXPostHashtagMemory,
  selectXPostHashtags,
  stripXPostHashtags,
} from "@/lib/automation-platform/execution/x-post-hashtags";

const MINERVOT_X_REQUEST = "毎日MINERVOTについて文章を考えてXに投稿して";

describe("X post hashtag selection", () => {
  it("AI generate + 0 tags when Memory says none", () => {
    const result = applyXAutomationPostHashtags({
      text: "毎日のX投稿、何を書こうで止まる。MINERVOTに本文を渡す。",
      memoryInjection: "ハッシュタグ不要",
      seed: 2,
    });
    expect(result.hashtags).toEqual([]);
    expect(result.text).not.toMatch(/#/);
    expect(result.text).toContain("毎日のX投稿");
  });

  it("AI generate + 1 related tag", () => {
    const result = selectXPostHashtags({
      body: "副業の時間、投稿文を考えるだけで消える。テーマだけ決めて本文は任せる。",
      seed: 1,
    });
    expect(result.hashtags.length).toBeGreaterThanOrEqual(1);
    expect(result.hashtags.length).toBeLessThanOrEqual(2);
    expect(result.hashtags).toContain("#副業");
    expect(result.hashtags.every((tag) => !isUnrelatedXPostHashtag(tag))).toBe(
      true,
    );
  });

  it("AI generate + 2 related tags", () => {
    const result = selectXPostHashtags({
      body: "AIで業務効率化したい。事務作業を少しずつ自動化していく話。",
      seed: 2,
    });
    expect(result.hashtags.length).toBe(2);
    expect(result.hashtags).toEqual(
      expect.arrayContaining(["#AI活用", "#業務効率化"]),
    );
  });

  it("does not attach unrelated trend tags", () => {
    const applied = applyXAutomationPostHashtags({
      text: "MINERVOTは依頼した仕事を進めるAI秘書。予定の整理を渡して完成を待つ。 #ニュース #芸能 #スポーツ",
      angle: "secretary_usage",
      seed: 2,
    });
    expect(applied.hashtags).not.toEqual(
      expect.arrayContaining(["#ニュース", "#芸能", "#スポーツ"]),
    );
    expect(applied.text).not.toMatch(/#ニュース|#芸能|#スポーツ|#イベント/);
    expect(applied.hashtags.length).toBeLessThanOrEqual(2);
  });

  it("does not rewrite fixed そのまま copy unless auto hashtags are allowed", () => {
    const classified = classifyXPostContent({
      configuration: {},
      freeformNotes: "毎日『おはようございます』と投稿して",
    });
    expect(classified.mode).toBe("fixed");
    expect(classified.text).toBe("おはようございます");
    expect(
      allowsFixedTextHashtagAuto({
        configuration: { contentSource: "fixed", text: "おはようございます" },
        notes: "毎日『おはようございます』と投稿して",
      }),
    ).toBe(false);
    expect(
      allowsFixedTextHashtagAuto({
        notes: "この文章をそのまま投稿して",
      }),
    ).toBe(false);
    expect(
      allowsFixedTextHashtagAuto({
        configuration: { autoHashtags: true },
        notes: "この文章をそのまま投稿して。ハッシュタグも自動で付けて",
      }),
    ).toBe(true);
  });

  it("Memoryなしでも選定できる / Memoryありなら補助する", () => {
    const body = "X投稿の自動化は、毎朝の一文からが現実的。";
    const without = selectXPostHashtags({ body, seed: 2 });
    const withNone = selectXPostHashtags({
      body,
      memoryInjection: "ハッシュタグなし",
      seed: 2,
    });
    const withBrand = applyXAutomationPostHashtags({
      text: "MINERVOTの使い方として、毎日のX投稿だけ先に任せる。",
      memoryInjection: "ブランドタグを付けたい",
      angle: "handy_tip",
      seed: 2,
    });

    expect(without.hashtags.length).toBeLessThanOrEqual(2);
    expect(withNone.hashtags).toEqual([]);
    expect(withBrand.hashtags).toContain("#MINERVOT");
    expect(parseXPostHashtagMemory("よく使うタグ: #副業\n使いたくないタグ: #フリーランス").preferred).toEqual(
      ["#副業"],
    );
    expect(parseXPostHashtagMemory("よく使うタグ: #副業\n使いたくないタグ: #フリーランス").banned).toEqual(
      ["#フリーランス"],
    );
  });

  it("does not mechanically attach #副業 and #フリーランス every time", () => {
    const sns = selectXPostHashtags({
      body: "X投稿の自動化は、毎朝の一文からが現実的。",
      seed: 2,
    });
    expect(sns.hashtags).not.toContain("#副業");
    expect(sns.hashtags).not.toContain("#フリーランス");

    const product = selectXPostHashtags({
      body: "MINERVOTの開発では、小さな一仕事が続くかを見ている。",
      angle: "product_improvement",
      seed: 1,
    });
    expect(product.hashtags).not.toEqual(
      expect.arrayContaining(["#副業", "#フリーランス"]),
    );
  });

  it("avoids repeating the exact same tags when an alternative exists", () => {
    const first = selectXPostHashtags({
      body: "AIで業務効率化したい。事務作業を少しずつ自動化していく話。",
      seed: 2,
    });
    const second = selectXPostHashtags({
      body: "AIで業務効率化したい。事務作業を少しずつ自動化していく話。",
      recentTexts: [attachXPostHashtags("前回", first.hashtags)],
      seed: 2,
    });
    expect(first.hashtags.length).toBeGreaterThan(0);
    if (first.hashtags.length > 1) {
      expect(second.hashtags.join(" ")).not.toBe(first.hashtags.join(" "));
    }
  });

  it("keeps body quality when tags are attached", () => {
    const body =
      "毎日のX投稿、地味に何を書こうで止まる。テーマだけ決めてMINERVOTに本文を渡す。";
    const applied = applyXAutomationPostHashtags({
      text: body,
      seed: 2,
    });
    expect(stripXPostHashtags(applied.text)).toBe(body);
    expect(isBrochureLikeXPost(applied.text)).toBe(false);
    expect(findForbiddenXPostClaims(applied.text)).toEqual([]);
    expect(applied.hashtags.length).toBeLessThanOrEqual(2);
  });
});

describe("same MINERVOT X automation — 5 virtual posts with hashtags", () => {
  it("varies 0–2 related tags without spam or fixed branding", () => {
    const classification = classifyXPostContent({
      configuration: { contentSource: "generate" },
      freeformNotes: MINERVOT_X_REQUEST,
      automationName: "SNS投稿の自動化",
    });
    expect(classification.mode).toBe("generate");

    const posts = [0, 1, 2, 3, 4].map((seed) => {
      const angle = selectXAutomationPostAngle(seed);
      const body = buildXAutomationPostFallbackText({
        angle,
        topic: classification.topic || "MINERVOT",
      });
      const applied = applyXAutomationPostHashtags({
        text: body,
        angle,
        topic: classification.topic,
        seed,
      });
      return { angle, ...applied };
    });

    const tagSets = posts.map((post) => post.hashtags.join(" "));
    expect(posts.every((post) => post.hashtags.length <= 2)).toBe(true);
    expect(posts.some((post) => post.hashtags.length === 0)).toBe(true);
    expect(new Set(tagSets).size).toBeGreaterThan(1);
    expect(posts.every((post) => !post.text.includes("#ニュース"))).toBe(true);
    expect(
      posts.every((post) => (post.text.match(/#/g) ?? []).length <= 2),
    ).toBe(true);

    for (const post of posts) {
      expect(isBrochureLikeXPost(post.text)).toBe(false);
      expect(findForbiddenXPostClaims(post.text)).toEqual([]);
      expect(extractXPostHashtags(post.text)).toEqual(post.hashtags);
      expect(post.hashtags.every((tag) => !isUnrelatedXPostHashtag(tag))).toBe(
        true,
      );
    }
  });
});
