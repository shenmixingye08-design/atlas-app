import { describe, expect, it } from "vitest";

import { applyPublishedBodyOverlay } from "@/lib/memory-apply/published-body";
import type { MemoryContentOverlay } from "@/lib/memory-apply/types";
import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import { runDeterministicQa } from "@/lib/orchestration/deterministic-qa";
import type { TaskExecutionResult } from "@/lib/orchestration/types";
import { blogPackageToWordPressPayload } from "./wordpress-map";
import {
  buildBlogArticlePackage,
  packageToMarkdown,
} from "./package";
import { resolveBlogIntent } from "./intent";
import {
  estimateBlogPipelineCost,
  evaluateBlogPlanSafety,
} from "./cost-estimate";

function article(text: string, extra = ""): string {
  return `${text}${extra}`;
}

const SEO = article(`検索意図は「やり方を知りたい」です。

## 検索意図
読者は手順を求めています。

## 押さえる要点
キーワードを繰り返すより、見出しで問いに答えます。

## 実践手順
1. 主題を1つに絞る
2. 導入で結論の方向を示す
3. 本文で具体例を書く
`);

const HOWTO = article(`請求書は次の順で発行します。

## 必要なもの
取引先コードと確定金額です。

## 手順
1. 案件を開く
2. 明細を確認する
3. 発行する

## つまずきやすい点
金額が未確定なら発行しません。
`);

const COMPARE = article(`A案は初期費用が低く、B案は運用が安定します。

## 比較の観点
月額とサポート範囲です。

## 違い
A案は平日のみ、B案は24時間です。

## 選び方
夜間対応が必要ならB案です。
`);

const PRODUCT = article(`MINERVOTは習慣的な作業を減らすAI秘書です。

## 誰向けか
毎日同じ資料を作っている担当者です。

## できること
報告書やブログ下書きを先に仕上げます。

## 向いていない場合
雑談だけが目的の使い方には向きません。
`);

const FAQ = article(`導入前によく聞かれる点を整理します。

Q: 公開は自動ですか？
A: WordPressへ送るのは接続後です。

Q: 検索1位になりますか？
A: 順位は保証しません。
`);

const SHORT = "習慣作業を秘書に渡すと、毎回の入力が減ります。判断はMINERVOTが先に行い、人は確認に集中できます。請求の締め日と担当を固定すると、同じ確認を繰り返さずに済みます。";
const STANDARD = `${HOWTO}

具体例として、月末の請求処理を同じ手順で回します。
取引先コードが空のときは発行せず、確定金額だけを使います。
発行後は送付記録を残し、次月の同じ作業に使います。
金額の内訳は明細行と一致しているかをその場で確認します。
未確定の仮数字は入れず、分かる範囲だけを書きます。
`.repeat(6);
const LONG = `${SEO}

${HOWTO}

${COMPARE}

読者は「自分の場合はどうすればよいか」を先に知りたいので、手順の直後に判断基準を置きます。
比較では月額だけでなく、サポート時間と担当範囲も並べます。
数字は入力にあるものだけ使い、分からない値は要確認とします。
`.repeat(8);

describe("blog intent", () => {
  it("classifies howto / comparison / product / seo / faq", () => {
    expect(resolveBlogIntent({ assignment: "初心者向けのやり方を書いて" })).toBe(
      "howto",
    );
    expect(resolveBlogIntent({ assignment: "AとBを比較して" })).toBe("comparison");
    expect(resolveBlogIntent({ assignment: "サービス紹介記事" })).toBe("product");
    expect(resolveBlogIntent({ assignment: "検索されやすい記事" })).toBe("seo_guide");
    expect(resolveBlogIntent({ assignment: "FAQ記事" })).toBe("faq");
  });
});

describe("Blog golden fixtures", () => {
  it("builds SEO / howto / comparison / product / FAQ packages", () => {
    const seo = buildBlogArticlePackage({
      assignment: "検索されやすい解説記事",
      title: "検索意図に沿った記事の書き方",
      content: SEO,
    });
    const howto = buildBlogArticlePackage({
      assignment: "初心者向けのやり方",
      title: "請求書の発行手順",
      content: HOWTO,
    });
    const compare = buildBlogArticlePackage({
      assignment: "商品比較記事",
      title: "A案とB案の違い",
      content: COMPARE,
    });
    const product = buildBlogArticlePackage({
      assignment: "サービス紹介",
      title: "MINERVOTの紹介",
      content: PRODUCT,
    });
    const faq = buildBlogArticlePackage({
      assignment: "FAQを書いて",
      title: "導入前の質問",
      content: FAQ,
    });
    expect(seo.intent).toBe("seo_guide");
    expect(howto.intent).toBe("howto");
    expect(compare.intent).toBe("comparison");
    expect(product.intent).toBe("product");
    expect(faq.faq.length).toBeGreaterThan(0);
    expect(seo.title).not.toMatch(/必見|衝撃|【保存版】/);
    expect(howto.body).toMatch(/^## /m);
    expect(product.cta).toBeTruthy();
    expect(seo.cta).toBeNull();
  });

  it("covers 1000 / 3000 / long-form lengths", () => {
    const short = buildBlogArticlePackage({
      assignment: "短い解説",
      title: "習慣作業を減らす",
      content: SHORT.repeat(8),
    });
    const standard = buildBlogArticlePackage({
      assignment: "標準の手順記事",
      title: "請求の手順",
      content: STANDARD,
    });
    const heavy = buildBlogArticlePackage({
      assignment: "長文の解説",
      title: "検索意図と記事構成",
      content: LONG,
    });
    expect(packageToMarkdown(short).length).toBeGreaterThan(400);
    expect(packageToMarkdown(standard).length).toBeGreaterThan(1000);
    expect(packageToMarkdown(heavy).length).toBeGreaterThan(3000);
  });

  it("applies Memory CTA/headings without English chrome", () => {
    const overlay: MemoryContentOverlay = {
      injectionText: "",
      writingStyle: null,
      tone: null,
      forbiddenExpressions: [],
      signature: null,
      contactLines: [],
      workStyleNotes: [],
      ocrDictionary: {},
      visionHints: [],
      preferenceKeys: ["seo", "cta"],
      preferShort: false,
      preferBullets: false,
      preferConclusionFirst: false,
      preferNoEmoji: false,
      preferHeadings: true,
      preferCta: true,
      preferSeo: true,
      ctaText: "関連する案内もご確認ください。",
      hashtagsMax: null,
      preferFewEmoji: false,
    };
    const applied = applyPublishedBodyOverlay(PRODUCT, overlay, "wordpress");
    expect(applied.appliedKeys).toContain("cta");
    expect(applied.appliedKeys).toContain("seo");
    expect(applied.text).not.toMatch(/Key points|Overview/);
  });

  it("produces excerpt, headings, and WordPress payload without posting", () => {
    const pkg = buildBlogArticlePackage({
      assignment: "ブログを書いて",
      title: "習慣作業を減らす方法",
      content: HOWTO,
    });
    expect(pkg.excerpt.length).toBeGreaterThan(20);
    expect(pkg.slug).toBeTruthy();
    const payload = blogPackageToWordPressPayload(pkg, "draft");
    expect(payload.title).toBe(pkg.title);
    expect(payload.content).toContain("必要なもの");
    expect(payload.excerpt).toBe(pkg.excerpt);
    expect(payload.slug).toBe(pkg.slug);
    expect(payload.status).toBe("draft");
  });

  it("keeps automation on the existing WordPress adapter payload shape", () => {
    const pkg = buildBlogArticlePackage({
      assignment: "毎週の解説記事",
      title: "請求書の発行手順",
      content: HOWTO,
    });
    const payload = blogPackageToWordPressPayload(pkg);
    expect(payload).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        content: expect.any(String),
      }),
    );
  });

  it("marks unsourced numbers as 要確認 instead of inventing citations", () => {
    const pkg = buildBlogArticlePackage({
      assignment: "市場の解説を書いて",
      title: "市場の見方",
      content: "市場規模は120億円で、導入率は85%です。調査によると伸びています。",
    });
    expect(pkg.body).toMatch(/要確認/);
    expect(pkg.factNotes.length).toBeGreaterThan(0);
    expect(pkg.body).not.toMatch(/厚生労働省|架空の出典/);
  });

  it("orchestration deliverable + QA stay blog-shaped", () => {
    const execution: TaskExecutionResult = {
      task: { id: 1, title: "記事", description: "ブログ" },
      assignedEmployeeId: "development-senior-dev",
      worker: {
        result: {
          agentId: "worker",
          role: "worker",
          name: "Worker",
          outputText: JSON.stringify({
            type: "blog",
            title: "請求書の発行手順",
            summary: "発行手順を短く整理します。",
            content: STANDARD,
            markdown: STANDARD,
            html: "",
            plainText: STANDARD,
            tags: ["請求"],
            seo: {
              title: "請求書の発行手順",
              description: "請求書の発行手順を解説します。",
              keywords: ["請求書"],
            },
            snsPost: "手順記事を公開しました。",
          }),
          responseId: "blog-golden",
          status: "completed",
          model: "gpt-test",
        },
        durationMs: 10,
      },
      workerStatus: "completed",
      reviewer: null,
      reviewerStatus: "skipped",
      approved: true,
    };
    const deliverable = buildDeliverable({
      assignment: "請求書のやり方をブログに書いて",
      executions: [execution],
    });
    expect(deliverable.type).toBe("blog");
    expect(deliverable.markdown).not.toMatch(/^## SEO$/m);
    expect(deliverable.metadata.excerpt).toBeTruthy();
    expect(deliverable.metadata.slug).toBeTruthy();
    const qa = runDeterministicQa(deliverable);
    expect(qa.failedChecks).not.toContain("english chrome in blog body");
    expect(qa.passed).toBe(true);
  });
});

describe("Blog quality score", () => {
  it("scores at least 95/100 from packages", () => {
    const seo = buildBlogArticlePackage({
      assignment: "検索されやすい解説",
      title: "検索意図に沿った書き方",
      content: SEO,
    });
    const howto = buildBlogArticlePackage({
      assignment: "初心者向け手順",
      title: "請求書の発行手順",
      content: HOWTO,
    });
    const facts = buildBlogArticlePackage({
      assignment: "解説",
      title: "確認が必要な数字",
      content: "市場規模は120億円です。",
    });
    const overlay: MemoryContentOverlay = {
      injectionText: "",
      writingStyle: null,
      tone: null,
      forbiddenExpressions: [],
      signature: null,
      contactLines: [],
      workStyleNotes: [],
      ocrDictionary: {},
      visionHints: [],
      preferenceKeys: ["seo", "cta"],
      preferShort: false,
      preferBullets: false,
      preferConclusionFirst: false,
      preferNoEmoji: false,
      preferHeadings: true,
      preferCta: true,
      preferSeo: true,
      ctaText: "関連する案内もご確認ください。",
      hashtagsMax: null,
      preferFewEmoji: false,
    };
    const memoryApplied = applyPublishedBodyOverlay(PRODUCT, overlay, "wordpress");
    const points = {
      intent: seo.intent === "seo_guide" && howto.intent === "howto" ? 10 : 5,
      title: !/必見|衝撃/.test(seo.title) ? 10 : 4,
      intro: howto.body.length > 40 ? 10 : 4,
      structure: (howto.body.match(/^## /gm) ?? []).length >= 2 ? 15 : 8,
      prose: !/Key points/.test(packageToMarkdown(seo)) ? 20 : 10,
      concrete: /手順|明細/.test(howto.body) ? 10 : 4,
      seo: Boolean(seo.excerpt && seo.slug && seo.metaDescription) ? 10 : 4,
      facts: /要確認/.test(facts.body) && facts.factNotes.length > 0 ? 5 : 1,
      memory:
        memoryApplied.appliedKeys.includes("cta") &&
        memoryApplied.appliedKeys.includes("seo")
          ? 5
          : 1,
      wp: Boolean(blogPackageToWordPressPayload(seo).excerpt) ? 5 : 1,
    };
    const total = Object.values(points).reduce((sum, value) => sum + value, 0);
    expect(total).toBeGreaterThanOrEqual(95);
  });
});

describe("Blog cost estimate (catalog SoT)", () => {
  it("separates AI cost from WordPress API cost", () => {
    const short = estimateBlogPipelineCost({
      kind: "short",
      assignment: "短い記事",
      markdown: SHORT.repeat(10),
    });
    const standard = estimateBlogPipelineCost({
      kind: "standard",
      assignment: "標準記事",
      markdown: STANDARD,
    });
    const heavy = estimateBlogPipelineCost({
      kind: "heavy",
      assignment: "長文記事",
      markdown: LONG,
      includeResearch: true,
    });
    expect(short.aiCalls).toBe(2);
    expect(short.wordpressApiCostUsd).toBe(0);
    expect(short.quotaRuns).toBe(1);
    expect(heavy.researchCalls).toBe(1);
    expect(heavy.aiCalls).toBe(3);
    expect(standard.estimatedUsd).toBeGreaterThan(short.estimatedUsd);
    expect(heavy.estimatedUsd).toBeGreaterThan(standard.estimatedUsd);
    expect(short.jpySource).toMatch(/FX_RATE_REQUIRED|ATLAS_USD_JPY_RATE/);
    expect(evaluateBlogPlanSafety(standard.estimatedUsd).map((row) => row.planId)).toEqual(
      ["light", "standard", "premium"],
    );
  });
});
