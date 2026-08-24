import { MIN_LEARNING_PUBLISHED } from "./constants";
import type { RevenueAgentEvent } from "./events";
import { contentVerdict, eventsForContent, filterEventsForRange } from "./funnel";
import type {
  InsightConfidence,
  MeasuredNumber,
  RankedPostInsight,
  RevenueContent,
  RevenueContentRow,
  RevenueFunnelRange,
  RevenueInsights,
  RevenueLearningRecommendation,
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

/**
 * 優先度: 入金済売上 > 有料契約 > 初回成功 > 無料登録 > ユニーククリック > 反応数
 * すべて未取得なら null（0点にしない）。
 */
export function scoreByRevenuePriority(input: {
  revenueYen: MeasuredNumber;
  paidContracts: MeasuredNumber;
  firstSuccesses: MeasuredNumber;
  signups: MeasuredNumber;
  uniqueClicks: MeasuredNumber;
  engagement: MeasuredNumber;
}): number | null {
  const parts = [
    input.revenueYen,
    input.paidContracts,
    input.firstSuccesses,
    input.signups,
    input.uniqueClicks,
    input.engagement,
  ];
  if (parts.every((value) => value == null)) return null;
  return (
    (input.revenueYen ?? 0) * 1_000_000_000 +
    (input.paidContracts ?? 0) * 1_000_000 +
    (input.firstSuccesses ?? 0) * 10_000 +
    (input.signups ?? 0) * 100 +
    (input.uniqueClicks ?? 0) +
    (input.engagement ?? 0) * 0.01
  );
}

export function scorePublishedItem(metrics: RevenueMetrics): number | null {
  return scoreByRevenuePriority({
    revenueYen: metrics.revenueYen,
    paidContracts: metrics.paidConversions,
    firstSuccesses: null,
    signups: metrics.signups,
    uniqueClicks: metrics.linkClicks,
    engagement: knownSum([metrics.likes, metrics.replies, metrics.reposts]).n
      ? knownSum([metrics.likes, metrics.replies, metrics.reposts]).sum
      : null,
  });
}

function confidenceFor(sampleSize: number, hasOutcome: boolean): InsightConfidence {
  if (sampleSize < MIN_LEARNING_PUBLISHED || !hasOutcome) return "insufficient";
  if (sampleSize < 8) return "provisional";
  return "directional";
}

function disclaimer(level: InsightConfidence): string {
  if (level === "insufficient") {
    return "データ不足のため判断保留。勝ちパターンとは断定しません。未取得の数値は 0 とみなしません。";
  }
  if (level === "provisional") {
    return "暫定です。入金・契約・初回成功の実測がある範囲だけの傾向です。";
  }
  return "方向性の参考です。まだ因果は断定しません。";
}

function nextAxis(verdict: RevenueLearningRecommendation["verdict"]): string {
  if (verdict === "continue") {
    return "同じ対象者の繰り返し作業削減と、無料登録CTAを維持する";
  }
  if (verdict === "improve") {
    return "登録後の初回依頼を先に見せ、月額980円からの有料化理由を1つに絞る";
  }
  if (verdict === "stop") {
    return "フックまたは対象者を変え、同じCTAの反復を止める";
  }
  return "サンプルが揃うまで同じ型を少量だけ試す";
}

export function buildRecommendations(rows: RevenueContentRow[]): RevenueLearningRecommendation[] {
  return rows
    .filter((row) => row.status === "published")
    .map((row) => {
      const { verdict, label } = contentVerdict({
        clicks: row.clicks,
        signups: row.signups,
        firstSuccesses: row.firstSuccesses,
        paidContracts: row.paidContracts,
        cashRevenueYen: row.cashRevenueYen,
      });
      return {
        contentId: row.contentId,
        title: row.title,
        verdict,
        reason: label,
        measured: {
          revenueYen: row.cashRevenueYen,
          paidContracts: row.paidContracts,
          firstSuccesses: row.firstSuccesses,
          signups: row.signups,
          uniqueClicks: row.clicks,
          engagement: null,
        },
        dataGap: verdict === "hold" ? "最低サンプルまたは成果の実測が不足" : null,
        nextCtaOrAxis: nextAxis(verdict),
      };
    });
}

export function buildRevenueInsights(
  items: RevenueContent[],
  events: RevenueAgentEvent[] = [],
  range: RevenueFunnelRange = "all",
  now = new Date(),
): RevenueInsights {
  const published = items.filter((item) => item.status === "published");
  const rangedEvents = filterEventsForRange(events, range, now);

  const scored = published
    .map((item) => {
      const rows = eventsForContent(rangedEvents, item.contentId);
      const uniqueClicks = rows.some((event) => event.eventName === "link_clicked")
        ? rows.filter((event) => event.eventName === "link_clicked").length
        : item.metrics.linkClicks;
      const signups = rows.some((event) => event.eventName === "signup_completed")
        ? rows.filter((event) => event.eventName === "signup_completed").length
        : item.metrics.signups;
      const paid = rows.some((event) => event.eventName === "subscription_started")
        ? rows.filter((event) => event.eventName === "subscription_started").length
        : item.metrics.paidConversions;
      const revenue = rows.some((event) => event.eventName === "invoice_paid")
        ? rows.reduce((sum, event) => {
            if (event.eventName !== "invoice_paid") return sum;
            return sum + (typeof event.metadata.amountYen === "number" ? event.metadata.amountYen : 0);
          }, 0)
        : item.metrics.revenueYen;
      const firstSuccesses = rows.some(
        (event) =>
          event.eventName === "first_job_completed" ||
          event.eventName === "first_automation_completed",
      )
        ? rows.filter(
            (event) =>
              event.eventName === "first_job_completed" ||
              event.eventName === "first_automation_completed",
          ).length
        : null;
      const score = scoreByRevenuePriority({
        revenueYen: revenue,
        paidContracts: paid,
        firstSuccesses,
        signups,
        uniqueClicks,
        engagement: knownSum([
          item.metrics.likes,
          item.metrics.replies,
          item.metrics.reposts,
        ]).n
          ? knownSum([item.metrics.likes, item.metrics.replies, item.metrics.reposts]).sum
          : null,
      });
      return { item, score };
    })
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
    note: "入金・契約・初回成功・登録・クリック・反応の順で並べています",
  });

  const sampleSize = published.length;
  const hasOutcome = scored.some((row) => row.score >= 100);
  const level = confidenceFor(sampleSize, hasOutcome);

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
    topPosts: level === "insufficient" ? [] : top.map(toInsight),
    bottomPosts: level === "insufficient" ? [] : bottom.map(toInsight),
    strongHooks: level === "insufficient" ? [] : top.map((row) => row.item.hook).filter(Boolean),
    strongThemes: level === "insufficient" ? [] : top.map((row) => row.item.kind),
    strongCtas: level === "insufficient" ? [] : top.map((row) => row.item.cta).filter(Boolean),
    lpVisitRate: rate(lpVisits.sum, impressions.n ? impressions.sum : null),
    signupRate: rate(signups.sum, lpVisits.n ? lpVisits.sum : null),
    paidConversionRate: rate(paid.sum, signups.n ? signups.sum : null),
    revenuePerPostYen:
      revenue.n > 0 && sampleSize > 0 ? revenue.sum / sampleSize : null,
    disclaimer: disclaimer(level),
    recommendations: [],
  };
}

export function insightHintsForPrompt(insights: RevenueInsights): string {
  if (insights.confidence === "insufficient") {
    return [
      "実績はデータ不足のため判断保留。勝ちパターンを断定しない。",
      "存在しない成果や理由を補完してはならない。",
      "過去投稿の丸写しは禁止。副業者・個人事業主の繰り返し作業と無料登録だけを使う。",
    ].join("\n");
  }
  const measured = insights.recommendations
    .filter((row) => row.verdict !== "hold")
    .slice(0, 3)
    .map((row) => {
      const yen = row.measured.revenueYen;
      const paid = row.measured.paidContracts;
      const signups = row.measured.signups;
      return `${row.title}: 入金=${yen ?? "未取得"} 契約=${paid ?? "未取得"} 登録=${signups ?? "未取得"} 判定=${row.verdict}`;
    })
    .join(" / ");
  return [
    `参考（実測のみ。${insights.disclaimer}）`,
    measured || "実測のある継続/改善/停止はまだない",
    "丸写し禁止。存在しない成果を書いてはならない。",
  ].join("\n");
}
