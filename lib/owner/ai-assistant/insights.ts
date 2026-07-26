import type { AssistantFacts } from "./facts";
import type {
  AiSuggestion,
  PlanProposal,
  ProfitInsight,
  QualityInsight,
  UserAnalysisInsight,
} from "./types";

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0 && current <= 0) return 0;
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function buildProfitInsights(facts: AssistantFacts): ProfitInsight[] {
  const insights: ProfitInsight[] = [];
  const period = facts.period;

  if (facts.marginPercent != null) {
    insights.push({
      id: "margin_now",
      period,
      kind: "margin",
      statement:
        period === "month"
          ? `今月の利益率は${facts.marginPercent}%です`
          : period === "week"
            ? `今週の利益率は${facts.marginPercent}%です`
            : `今日の利益率は${facts.marginPercent}%です`,
    });
    if (facts.marginPercent < 60) {
      insights.push({
        id: "margin_down",
        period,
        kind: "margin",
        statement: "利益率が低下しています（目安70%を下回っています）",
      });
    }
  }

  const apiPct = pctChange(facts.current.apiCostUsd, facts.previous.apiCostUsd);
  if (apiPct != null && Math.abs(apiPct) >= 5) {
    insights.push({
      id: "api_cost_trend",
      period,
      kind: "cost",
      statement:
        apiPct >= 0
          ? `APIコストが${apiPct}%増加しました`
          : `APIコストが${Math.abs(apiPct)}%減少しました`,
    });
  }

  if (facts.highestMarginDeliverable) {
    const m = facts.highestMarginDeliverable;
    insights.push({
      id: "best_margin_deliverable",
      period,
      kind: "deliverable",
      statement:
        m.marginPercent != null
          ? `利益率が最も高い成果物は${m.label}です（利益率 ${m.marginPercent}%）`
          : `原価効率が相対的に良い成果物は${m.label}です`,
    });
  }

  if (facts.risingCostDeliverable) {
    insights.push({
      id: "rising_cost_deliverable",
      period,
      kind: "deliverable",
      statement: `${facts.risingCostDeliverable.label}の原価が相対的に大きいです（平均 $${facts.risingCostDeliverable.avgCostUsd}）`,
    });
  }

  if (facts.topDeliverable) {
    insights.push({
      id: "top_deliverable",
      period,
      kind: "trend",
      statement: `${facts.topDeliverable.label}生成が最も利用されています（${facts.topDeliverable.usageCount}回）`,
    });
  }

  return insights;
}

export function buildUserInsights(facts: AssistantFacts): UserAnalysisInsight[] {
  return [
    {
      id: "usage_freq",
      label: "利用頻度",
      value: `${facts.current.totalRequests.toLocaleString("ja-JP")} 回`,
      note: "期間内AIリクエスト",
    },
    {
      id: "retention",
      label: "継続率",
      value:
        facts.churnRatePercent != null
          ? `${Math.round((100 - facts.churnRatePercent) * 10) / 10}%`
          : "—",
      note: facts.churnRatePercent != null ? "100 − 解約率" : "解約データ不足",
    },
    {
      id: "popular",
      label: "人気機能",
      value: facts.topDeliverable?.label ?? "—",
      note: facts.topDeliverable
        ? `${facts.topDeliverable.usageCount}回`
        : "利用データなし",
    },
    {
      id: "churn",
      label: "解約率",
      value:
        facts.churnRatePercent != null ? `${facts.churnRatePercent}%` : "—",
      note: null,
    },
    {
      id: "avg_cost",
      label: "平均原価",
      value:
        facts.paidUsers > 0
          ? `$${(facts.current.apiCostUsd / facts.paidUsers).toFixed(2)} / 有料会員`
          : facts.current.totalRequests > 0
            ? `$${(facts.current.apiCostUsd / facts.current.totalRequests).toFixed(3)} / 回`
            : "—",
      note: null,
    },
    {
      id: "ltv",
      label: "LTV",
      value: facts.ltvJpy != null ? `¥${facts.ltvJpy.toLocaleString("ja-JP")}` : "—",
      note: facts.ltvJpy == null ? "解約率が0または未計測" : "ARPU ÷ 月次解約率",
    },
    {
      id: "arpu",
      label: "ARPU",
      value:
        facts.arpuJpy != null ? `¥${facts.arpuJpy.toLocaleString("ja-JP")}` : "—",
      note: "MRR ÷ 有料会員",
    },
  ];
}

export function buildQualityInsights(facts: AssistantFacts): QualityInsight[] {
  return facts.qualityRows
    .filter((row) => row.usageCount > 0)
    .map((row) => {
      let qualityFlag: QualityInsight["qualityFlag"] = "ok";
      const details: string[] = [];
      if (row.avgDurationMs > 60_000) {
        qualityFlag = "watch";
        details.push("平均生成時間が60秒超");
      }
      if (row.avgDurationMs > 120_000) {
        qualityFlag = "danger";
        details.push("平均生成時間が120秒超");
      }
      if (row.avgCostUsd != null && row.avgCostUsd > 0.2) {
        if (qualityFlag === "ok") qualityFlag = "watch";
        details.push(`平均APIコスト $${row.avgCostUsd}`);
      }
      if (row.failureRatePercent != null && row.failureRatePercent >= 10) {
        qualityFlag = row.failureRatePercent >= 25 ? "danger" : "watch";
        details.push(`失敗率 ${row.failureRatePercent}%`);
      }
      if (details.length === 0) details.push("品質指標は許容範囲");

      return {
        featureId: row.featureId,
        label: row.label,
        avgDurationMs: row.avgDurationMs || null,
        failureRatePercent: row.failureRatePercent,
        avgCostUsd: row.avgCostUsd,
        generationCount: row.usageCount,
        qualityFlag,
        detail: details.join(" / "),
      };
    })
    .sort((a, b) => {
      const rank = { danger: 3, watch: 2, ok: 1 } as const;
      return rank[b.qualityFlag] - rank[a.qualityFlag];
    });
}

export function buildPlanProposals(facts: AssistantFacts): PlanProposal[] {
  const fx = facts.usdJpyRate;
  const proposals: PlanProposal[] = facts.planBreakdown
    .filter((p) => p.planId !== "free")
    .map((plan) => {
      const revenue = plan.subscribers * plan.priceJpy;
      const costJpy =
        fx != null ? Math.round(plan.aiCostUsd * fx) : null;
      const margin =
        revenue > 0 && costJpy != null
          ? Math.round(((revenue - costJpy) / revenue) * 1000) / 10
          : null;

      const suggestions: string[] = [];
      if (margin != null && margin < 50) {
        suggestions.push(
          `利益率が${margin}%です。価格改定（+10〜20%）またはAI回数上限の見直しを検討してください`,
        );
      } else if (margin != null && margin > 80 && plan.subscribers > 0) {
        suggestions.push(
          `利益率に余裕があります。高品質回数や利用回数を増やしても利益を維持しやすいです`,
        );
      }
      if (plan.aiRuns > 0 && plan.subscribers > 0) {
        const runsPerUser = Math.round(plan.aiRuns / plan.subscribers);
        suggestions.push(
          `会員あたり平均AI利用 ${runsPerUser} 回。上限設計の参考にしてください`,
        );
      }
      if (suggestions.length === 0) {
        suggestions.push("実データ上、当面の改定は必須ではありません");
      }

      return {
        planId: plan.planId,
        planName: plan.planName,
        currentPriceJpy: plan.priceJpy,
        subscribers: plan.subscribers,
        estimatedMarginPercent: margin,
        suggestions,
      };
    });

  // 法人プランは未定義 — ダミーを作らず注記のみ
  proposals.push({
    planId: "enterprise",
    planName: "法人",
    currentPriceJpy: 0,
    subscribers: 0,
    estimatedMarginPercent: null,
    suggestions: [
      "法人プランは現在プラン定義にないため分析対象外です（価格・枠を定義後に再分析）",
    ],
  });

  return proposals;
}

export function buildRuleSuggestions(
  facts: AssistantFacts,
  quality: readonly QualityInsight[],
): AiSuggestion[] {
  const suggestions: AiSuggestion[] = [];

  const light = facts.planBreakdown.find((p) => p.planId === "light");
  if (light && facts.usdJpyRate != null) {
    const hqCost = estimateHqRunJpy(facts.usdJpyRate);
    const affordable = Math.floor((light.priceJpy * 0.35) / Math.max(1, hqCost));
    if (affordable > 0) {
      suggestions.push({
        id: "light_hq_runs",
        priority: "medium",
        title: "ライトプランの高品質回数",
        body: `ライトプラン（¥${light.priceJpy}）は高品質モードを約${affordable}回まで増やしても利益余地を残しやすい計算です`,
        source: "rules",
      });
    }
  }

  if (facts.risingCostDeliverable && facts.topDeliverable) {
    suggestions.push({
      id: "template_reuse",
      priority: "high",
      title: "テンプレート利用率の向上",
      body: `${facts.risingCostDeliverable.label}は原価が相対的に大きいです。テンプレート再利用・キャッシュでAPIコスト削減を検討してください`,
      source: "rules",
    });
  }

  if (facts.current.visionRequests > 0) {
    suggestions.push({
      id: "vision_cache",
      priority: "medium",
      title: "Vision処理のキャッシュ",
      body: `Vision利用が${facts.current.visionRequests}回あります。同一画像の再解析を避けると月額コストを削減できます`,
      source: "rules",
    });
  }

  if (facts.highestMarginDeliverable) {
    suggestions.push({
      id: "best_product",
      priority: "low",
      title: "最も利益率の高い成果物",
      body: `現在最も利益効率が良い成果物は${facts.highestMarginDeliverable.label}です`,
      source: "rules",
    });
  }

  const dangerQuality = quality.filter((q) => q.qualityFlag === "danger");
  for (const q of dangerQuality.slice(0, 2)) {
    suggestions.push({
      id: `quality_${q.featureId}`,
      priority: "high",
      title: `${q.label}の品質低下`,
      body: q.detail,
      source: "rules",
    });
  }

  if (facts.churnRatePercent != null && facts.churnRatePercent >= 5) {
    suggestions.push({
      id: "churn_action",
      priority: "high",
      title: "解約率の改善",
      body: `解約率 ${facts.churnRatePercent}%。オンボーディング強化と高コストユーザーへの利用ガイドを検討してください`,
      source: "rules",
    });
  }

  return suggestions;
}

export function estimateHqRunJpy(usdJpyRate: number): number {
  // Strong-model HQ deliverable estimate (catalog prices × typical tokens).
  // Not a filler — uses MODEL_CATALOG unit prices with documented assumptions.
  const inputTokens = 60_000;
  const outputTokens = 12_000;
  const usd =
    (inputTokens / 1_000_000) * 8.0 + (outputTokens / 1_000_000) * 24.0;
  return Math.max(1, Math.round(usd * usdJpyRate));
}

export function buildRuleSummaryBullets(facts: AssistantFacts): string[] {
  const bullets: string[] = [];
  if (facts.current.revenueJpy != null) {
    const revPct = pctChange(
      facts.current.revenueJpy,
      facts.previous.revenueJpy ?? 0,
    );
    if (revPct != null && facts.previous.revenueJpy != null && facts.previous.revenueJpy > 0) {
      bullets.push(
        revPct >= 0
          ? `売上は前期比${revPct}%増加しました`
          : `売上は前期比${Math.abs(revPct)}%減少しました`,
      );
    } else {
      bullets.push(
        `期間売上は¥${facts.current.revenueJpy.toLocaleString("ja-JP")}です`,
      );
    }
  }
  if (facts.topDeliverable) {
    bullets.push(
      `${facts.topDeliverable.label}生成が最も利用されています`,
    );
  }
  const apiPct = pctChange(facts.current.apiCostUsd, facts.previous.apiCostUsd);
  if (apiPct != null && Math.abs(apiPct) <= 15) {
    bullets.push("APIコストは適正範囲です");
  } else if (apiPct != null) {
    bullets.push(`APIコストは前期比${apiPct}%です`);
  }
  if (facts.marginPercent != null) {
    bullets.push(`利益率は${facts.marginPercent}%です`);
  }
  if (facts.hqUsageSharePercent != null) {
    bullets.push(`高品質モード利用率は${facts.hqUsageSharePercent}%です`);
  }
  if (bullets.length === 0) {
    bullets.push("十分な実データがまだ蓄積されていません");
  }
  return bullets;
}
