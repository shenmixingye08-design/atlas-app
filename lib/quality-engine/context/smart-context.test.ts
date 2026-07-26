import { describe, expect, it, beforeEach } from "vitest";

import { estimateTokens } from "@/lib/ai/cost-meter";
import { buildQualityContextPack } from "@/lib/quality-engine/context-pack";
import { normalizeKnowledgeEntry } from "@/lib/quality-engine/knowledge/normalize";
import type { NormalizedKnowledgeEntry } from "@/lib/quality-engine/knowledge/types";
import {
  CONTEXT_TOKEN_BUDGETS,
  fingerprintText,
  getContextTokenBudget,
  invalidateSmartContextCache,
  isInformationGapFeedback,
  pickRefillCandidateIds,
  resetSmartContextCacheForTests,
  selectSmartContext,
  sumSelectedTokens,
} from "@/lib/quality-engine/context";

function entry(
  partial: Partial<NormalizedKnowledgeEntry> &
    Pick<NormalizedKnowledgeEntry, "id" | "layer" | "title" | "body">,
): NormalizedKnowledgeEntry {
  return normalizeKnowledgeEntry({
    id: partial.id,
    layer: partial.layer,
    title: partial.title,
    body: partial.body,
    kinds: partial.kinds,
    meta: partial.meta,
  });
}

describe("Smart Context Engine", () => {
  beforeEach(() => {
    resetSmartContextCacheForTests();
  });

  it("1. prefers sales knowledge for sales materials", () => {
    const pack = buildQualityContextPack({
      assignment: "営業資料を作成。顧客課題とCTAを明確に",
      deliverableType: "presentation",
      metadata: {
        userId: "u-sales",
        businessProfileSummary: "株式会社サンプル",
      },
    });
    const ids = pack.smartContext.decisions
      ?.filter((d) => d.selected)
      .map((d) => d.id) ?? [];
    expect(ids.some((id) => id.startsWith("sales."))).toBe(true);
    expect(pack.knowledgePack.mergedText).toContain("営業構成");
  });

  it("2. prefers SEO knowledge for blog", () => {
    const pack = buildQualityContextPack({
      assignment: "SEOを意識したブログ記事を書いて",
      deliverableType: "document",
      metadata: {
        userId: "u-blog",
        businessProfileSummary: "メディア社",
      },
    });
    const selected = pack.smartContext.decisions?.filter((d) => d.selected) ?? [];
    expect(selected.some((d) => d.id === "blog.seo")).toBe(true);
    expect(pack.knowledgePack.mergedText).toMatch(/SEO/i);
  });

  it("3. keeps legal rules for contracts", () => {
    const pack = buildQualityContextPack({
      assignment: "業務委託契約書を作成",
      deliverableType: "document",
      metadata: {
        userId: "u-contract",
        businessProfileSummary: "株式会社法務",
      },
    });
    const selected = pack.smartContext.decisions?.filter((d) => d.selected) ?? [];
    expect(selected.some((d) => d.id === "contract.legal")).toBe(true);
    expect(pack.knowledgePack.mergedText).toContain("法務");
  });

  it("4. always keeps explicit user instructions", () => {
    const pack = buildQualityContextPack({
      assignment: "必ず納期は2026-08-01、予算は1,200,000円で書いてください",
      deliverableType: "email",
      metadata: {
        userId: "u-instr",
        businessProfileSummary: "ACME",
      },
    });
    const instr = pack.smartContext.decisions?.find(
      (d) => d.id === "runtime.user_instruction",
    );
    expect(instr?.selected).toBe(true);
    expect(instr?.required).toBe(true);
    expect(pack.knowledgePack.mergedText).toContain("1,200,000");
    expect(pack.knowledgePack.mergedText).toContain("2026-08-01");
  });

  it("5. excludes unrelated knowledge", () => {
    const candidates = [
      entry({
        id: "keep.sales",
        layer: "deliverable",
        title: "営業CTA",
        body: "営業資料のCTAを明示する",
        kinds: ["sales_material"],
        meta: { tags: ["sales", "cta"], priority: 80 },
      }),
      entry({
        id: "drop.excel",
        layer: "deliverable",
        title: "Excel数式",
        body: "SUMとVLOOKUPのルール",
        kinds: ["excel"],
        meta: { tags: ["excel_formula"], priority: 80 },
      }),
      entry({
        id: "drop.seo",
        layer: "deliverable",
        title: "ブログSEO",
        body: "meta description を書く",
        kinds: ["blog"],
        meta: { tags: ["blog_seo", "seo"], priority: 80 },
      }),
    ];
    const result = selectSmartContext({
      candidates,
      promptKind: "sales_material",
      assignment: "営業資料の提案",
      userId: "u-filter",
      bypassCache: true,
    });
    const selectedIds = result.selected.map((e) => e.id);
    expect(selectedIds).toContain("keep.sales");
    expect(selectedIds).not.toContain("drop.excel");
    expect(selectedIds).not.toContain("drop.seo");
  });

  it("6. stays within context token budget", () => {
    const bloated = Array.from({ length: 40 }, (_, i) =>
      entry({
        id: `bulk.${i}`,
        layer: "industry",
        title: `業界メモ${i}`,
        body: "あ".repeat(800),
        meta: { priority: 40 + (i % 10), tags: ["industry"] },
      }),
    );
    const result = selectSmartContext({
      candidates: [
        entry({
          id: "runtime.user_instruction",
          layer: "user_instruction",
          title: "指示",
          body: "短文ブログを書いて",
          meta: { required: true, priority: 100 },
        }),
        ...bloated,
      ],
      promptKind: "blog",
      assignment: "短文ブログを書いて",
      userId: "u-budget",
      bypassCache: true,
    });
    const budget = getContextTokenBudget("blog");
    expect(CONTEXT_TOKEN_BUDGETS.blog).toBe(8_000);
    expect(sumSelectedTokens(result.scored)).toBeLessThanOrEqual(
      budget + 200,
    );
    expect(result.stats.estimatedInputTokens).toBeLessThanOrEqual(
      budget + estimateTokens(result.compressedText),
    );
  });

  it("7. keeps required context even when over budget", () => {
    const requiredBody = "必須ユーザー条件: 金額は500万円、禁止表現を守る。";
    const result = selectSmartContext({
      candidates: [
        entry({
          id: "req.user",
          layer: "user_instruction",
          title: "明示指示",
          body: requiredBody,
          meta: { required: true, priority: 100 },
        }),
        entry({
          id: "req.bp",
          layer: "business_profile",
          title: "会社",
          body: "株式会社必須 / ブランドMINERVOT",
          meta: { required: true, priority: 95 },
        }),
        ...Array.from({ length: 30 }, (_, i) =>
          entry({
            id: `noise.${i}`,
            layer: "industry",
            title: `noise${i}`,
            body: "余剰".repeat(500),
            meta: { priority: 30 },
          }),
        ),
      ],
      promptKind: "sns",
      assignment: requiredBody,
      userId: "u-required",
      bypassCache: true,
    });
    const selectedIds = result.selected.map((e) => e.id);
    expect(selectedIds).toContain("req.user");
    expect(selectedIds).toContain("req.bp");
    expect(result.compressedText).toContain("500万円");
  });

  it("8. removes duplicate context", () => {
    const dup = "同じ会社情報: 株式会社デュプ / SaaS";
    const result = selectSmartContext({
      candidates: [
        entry({
          id: "a",
          layer: "company",
          title: "会社A",
          body: dup,
          meta: { priority: 70 },
        }),
        entry({
          id: "b",
          layer: "company",
          title: "会社B",
          body: dup,
          meta: { priority: 60 },
        }),
      ],
      promptKind: "sales_material",
      assignment: "会社紹介の営業資料",
      userId: "u-dup",
      bypassCache: true,
    });
    const selectedCompany = result.scored.filter(
      (s) => s.selected && s.entry.layer === "company",
    );
    expect(selectedCompany.length).toBe(1);
    expect(
      result.scored.some((s) => s.exclusionReasons.includes("duplicate")),
    ).toBe(true);
  });

  it("9. does not mix cache across users", () => {
    const candidates = [
      entry({
        id: "shared.rule",
        layer: "rules",
        title: "共通",
        body: "トーンは丁寧に",
        meta: { priority: 70 },
      }),
    ];
    const a = selectSmartContext({
      candidates,
      promptKind: "email",
      assignment: "お礼メール",
      userId: "user-a",
      organizationId: "org-1",
    });
    expect(a.stats.cacheHit).toBe(false);

    const aHit = selectSmartContext({
      candidates,
      promptKind: "email",
      assignment: "お礼メール",
      userId: "user-a",
      organizationId: "org-1",
    });
    expect(aHit.stats.cacheHit).toBe(true);

    const b = selectSmartContext({
      candidates,
      promptKind: "email",
      assignment: "お礼メール",
      userId: "user-b",
      organizationId: "org-1",
    });
    expect(b.stats.cacheHit).toBe(false);
  });

  it("10. invalidates cache after knowledge update", () => {
    const v1 = [
      entry({
        id: "k1",
        layer: "brand",
        title: "トーン",
        body: "落ち着いたトーン",
        meta: { version: 1, updatedAt: "2026-01-01T00:00:00.000Z", priority: 70 },
      }),
    ];
    selectSmartContext({
      candidates: v1,
      promptKind: "blog",
      assignment: "記事",
      userId: "u-cache",
    });
    const hit = selectSmartContext({
      candidates: v1,
      promptKind: "blog",
      assignment: "記事",
      userId: "u-cache",
    });
    expect(hit.stats.cacheHit).toBe(true);

    const fp = fingerprintText(
      v1
        .map(
          (c) =>
            `${c.id}:${c.meta.version}:${c.meta.updatedAt}:${c.body.slice(0, 80)}`,
        )
        .sort()
        .join("|"),
    );
    invalidateSmartContextCache({
      userId: "u-cache",
      knowledgeFingerprint: fp,
    });

    const v2 = [
      entry({
        id: "k1",
        layer: "brand",
        title: "トーン",
        body: "明るいトーンに更新",
        meta: { version: 2, updatedAt: "2026-07-01T00:00:00.000Z", priority: 70 },
      }),
    ];
    const after = selectSmartContext({
      candidates: v2,
      promptKind: "blog",
      assignment: "記事",
      userId: "u-cache",
    });
    expect(after.stats.cacheHit).toBe(false);
    expect(after.compressedText).toContain("明るいトーン");
  });

  it("11. performs selection with zero extra LLM calls", () => {
    const result = selectSmartContext({
      candidates: [
        entry({
          id: "x",
          layer: "brand",
          title: "ブランド",
          body: "誠実な文体",
        }),
      ],
      promptKind: "email",
      assignment: "案内メール",
      userId: "u-llm0",
      bypassCache: true,
    });
    expect(result.stats.extraLlmCalls).toBe(0);
    const pack = buildQualityContextPack({
      assignment: "案内メール",
      deliverableType: "email",
      metadata: { userId: "u-llm0-b", businessProfileSummary: "ACME" },
    });
    expect(pack.smartContext.extraLlmCalls).toBe(0);
  });

  it("12. tolerates legacy knowledge without metadata", () => {
    const legacy = normalizeKnowledgeEntry({
      id: "legacy.1",
      layer: "company",
      title: "旧データ",
      body: "会社の強みはサポート品質",
    });
    expect(legacy.meta.enabled).toBe(true);
    expect(legacy.meta.priority).toBeGreaterThan(0);
    expect(legacy.meta.estimatedTokens).toBeGreaterThan(0);

    const result = selectSmartContext({
      candidates: [legacy],
      promptKind: "sales_material",
      assignment: "強みを伝える営業資料",
      bypassCache: true,
    });
    expect(result.stats.candidateCount).toBe(1);
    expect(result.stats.extraLlmCalls).toBe(0);
  });

  it("13. refills at most once on information gap", () => {
    expect(isInformationGapFeedback("情報不足: Contextが足りません")).toBe(
      true,
    );
    expect(isInformationGapFeedback("構成を整えてください")).toBe(false);

    const scored = [
      {
        entry: entry({
          id: "next.1",
          layer: "industry",
          title: "次点",
          body: "追加の業界知識",
        }),
        score: 40,
        required: false,
        reasons: [],
        exclusionReasons: ["budget_exceeded" as const],
        selected: false,
        estimatedTokens: 20,
      },
      {
        entry: entry({
          id: "bad.mismatch",
          layer: "deliverable",
          title: "不一致",
          body: "excel",
          kinds: ["excel"],
        }),
        score: 90,
        required: false,
        reasons: [],
        exclusionReasons: ["artifact_type_mismatch" as const],
        selected: false,
        estimatedTokens: 10,
      },
    ];
    const ids = pickRefillCandidateIds(scored, 3);
    expect(ids).toEqual(["next.1"]);
    expect(ids).not.toContain("bad.mismatch");
  });

  it("14. does not dump large context into short-form SNS", () => {
    const pack = buildQualityContextPack({
      assignment: "新商品のSNS投稿を1つ",
      deliverableType: "social_post",
      metadata: {
        userId: "u-sns",
        businessProfileSummary: "株式会社ショート",
        companyKnowledge: "長い会社沿革。".repeat(200),
        industryKnowledge: "市場分析レポート。".repeat(200),
      },
    });
    expect(pack.promptKind).toBe("sns");
    expect(pack.smartContext.budgetTokens).toBe(CONTEXT_TOKEN_BUDGETS.sns);
    expect(pack.smartContext.estimatedInputTokens).toBeLessThanOrEqual(
      CONTEXT_TOKEN_BUDGETS.sns + 400,
    );
    // Past deliverables should not dominate short posts
    expect(pack.smartContext.usedPastArtifactCount).toBeLessThanOrEqual(1);
  });
});
