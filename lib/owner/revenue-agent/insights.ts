import type {
  InsightConfidence,
  RankedPostInsight,
  RevenueContent,
  RevenueInsights,
  RevenueMetrics,
} from "./types";

function knownSum(values: Array<number | null>): { sum: number; n: number } {
  let sum = 0;
  let n = 0;
  for (const value of values) {
    if (value == null) continue;
    sum += value;
    n += 1;
  }
  return { sum, n };
}

function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

export function scorePublishedItem(metrics: RevenueMetrics): number | null {
  const { sum, n } = knownSum([
    metrics.likes,
    metrics.replies,
    metrics.reposts,
    metrics.linkClicks,
    metrics.lpVisits,
    metrics.signups,
    metrics.paidConversions,
  ]);
  if (n === 0) {
    return metrics.impressions == null ? null : metrics.impressions;
  }
  const impressions = metrics.impressions ?? 0;
  return sum + impressions * 0.01;
}

function confidenceFor(sampleSize: number): InsightConfidence {
  if (sampleSize < 3) return "insufficient";
  if (sampleSize < 8) return "provisional";
  return "directional";
}

function disclaimer(level: InsightConfidence): string {
  if (level === "insufficient") {
    return "サンプル不足です。因果関係は断定しません。未取得の数値は 0 とみなしません。";
  }
  if (level === "provisional") {
    return "暫定です。反応の傾向であり、効果の証明ではありません。";
  }
  return "方向性の参考です。まだ因果は断定しません。";
}

export function buildRevenueInsights(items: RevenueContent[]): RevenueInsights {
  const published = items.filter((item) => item.status === "published");
  const scored = published
    .map((item) => ({
      item,
      score: scorePublishedItem(item.metrics),
    }))
    .filter((row) => row.score != null) as Array<{
    item: RevenueContent;
    score: number;
  }>;

  scored.sort((a, b) => b.score - a.score);
  const toInsight = (row: { item: RevenueContent; score: number }): RankedPostInsight => ({
    id: row.item.id,
    title: row.item.title,
    hook: row.item.hook,
    score: row.score,
    note: "実測がある項目だけで並べています",
  });

  const sampleSize = published.length;
  const level = confidenceFor(sampleSize);

  const lpVisits = knownSum(published.map((item) => item.metrics.lpVisits));
  const signups = knownSum(published.map((item) => item.metrics.signups));
  const paid = knownSum(published.map((item) => item.metrics.paidConversions));
  const revenue = knownSum(published.map((item) => item.metrics.revenueYen));
  const impressions = knownSum(published.map((item) => item.metrics.impressions));

  const top = scored.slice(0, 3);
  const bottom = [...scored].reverse().slice(0, 3);

  return {
    confidence: level,
    sampleSize,
    topPosts: top.map(toInsight),
    bottomPosts: bottom.map(toInsight),
    strongHooks: top.map((row) => row.item.hook).filter(Boolean),
    strongThemes: top.map((row) => row.item.kind),
    strongCtas: top.map((row) => row.item.cta).filter(Boolean),
    lpVisitRate: rate(lpVisits.sum, impressions.n ? impressions.sum : null),
    signupRate: rate(signups.sum, lpVisits.n ? lpVisits.sum : null),
    paidConversionRate: rate(paid.sum, signups.n ? signups.sum : null),
    revenuePerPostYen:
      revenue.n > 0 && sampleSize > 0 ? revenue.sum / sampleSize : null,
    disclaimer: disclaimer(level),
  };
}

export function insightHintsForPrompt(insights: RevenueInsights): string {
  if (insights.confidence === "insufficient") {
    return "実績はサンプル不足。過去投稿の丸写しは禁止。一般的な悩みと手順だけを使う。";
  }
  const hooks = insights.strongHooks.slice(0, 3).join(" / ") || "なし";
  const themes = insights.strongThemes.slice(0, 3).join(" / ") || "なし";
  const ctas = insights.strongCtas.slice(0, 3).join(" / ") || "なし";
  return [
    `参考（${insights.disclaimer}）`,
    `反応が良かった冒頭の傾向: ${hooks}`,
    `テーマ傾向: ${themes}`,
    `CTA傾向: ${ctas}`,
    "丸写し禁止。同じ型でも文言は新しくする。",
  ].join("\n");
}
