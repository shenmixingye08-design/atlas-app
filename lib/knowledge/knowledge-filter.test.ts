import { describe, expect, it } from "vitest";

import {
  filterKnowledgeForWorkflow,
  KNOWLEDGE_RELEVANCE_MIN,
} from "@/lib/knowledge/knowledge-filter";
import type { KnowledgeEntry } from "@/lib/knowledge/types";

function entry(partial: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, "id" | "title" | "category" | "summary">): KnowledgeEntry {
  return {
    tags: [],
    sourceWorkflowId: null,
    reusable: true,
    confidence: 90,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("knowledge filter", () => {
  it("discards blog/SEO knowledge for email requests", () => {
    const pool: KnowledgeEntry[] = [
      entry({
        id: "1",
        title: "SEOブログ運用ガイド",
        category: "reusable_strategy",
        summary: "キーワード最適化とトレンド分析でブログ記事を量産する",
        tags: ["blog", "seo"],
      }),
      entry({
        id: "2",
        title: "営業メールの書き方",
        category: "reusable_strategy",
        summary: "建設会社向け営業メールの件名と本文テンプレート",
        tags: ["email", "営業"],
        assignmentHint: "建設会社へ営業メール",
      }),
      entry({
        id: "3",
        title: "過去のQA指摘",
        category: "quality",
        summary: "見出しが不足している",
        tags: ["qa"],
      }),
    ];

    const result = filterKnowledgeForWorkflow(
      pool,
      "建設会社へ太陽光発電の営業メールを作成",
      "email",
    );

    expect(result.diagnostics.discardedCount).toBeGreaterThan(0);
    expect(result.workerEntries.every((e) => e.id !== "1")).toBe(true);
    expect(result.workerEntries.every((e) => e.category !== "quality")).toBe(true);
    expect(result.diagnostics.decisions.find((d) => d.entryId === "3")?.reason).toContain(
      "quality",
    );
  });

  it("requires normalized relevance >= threshold", () => {
    const pool: KnowledgeEntry[] = [
      entry({
        id: "x",
        title: "無関係な話題",
        category: "company_learning",
        summary: "全く別の業界の話",
        confidence: 10,
      }),
    ];

    const result = filterKnowledgeForWorkflow(pool, "営業メール", "email");
    expect(result.workerEntries).toHaveLength(0);
    expect(result.diagnostics.decisions[0]?.relevanceScore).toBeLessThan(
      KNOWLEDGE_RELEVANCE_MIN,
    );
  });
});
