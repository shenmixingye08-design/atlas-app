import type { AssistantFacts } from "./facts";
import type { AlertSeverity, CostAnomaly, ManagementAlert } from "./types";

function changePercent(current: number, previous: number): number | null {
  if (previous <= 0 && current <= 0) return 0;
  if (previous <= 0 && current > 0) return 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function severityFromIncrease(
  pct: number | null,
  watchAt: number,
  dangerAt: number,
): AlertSeverity {
  if (pct == null) return "ok";
  if (pct >= dangerAt) return "danger";
  if (pct >= watchAt) return "watch";
  return "ok";
}

export function detectCostAnomalies(facts: AssistantFacts): CostAnomaly[] {
  const anomalies: CostAnomaly[] = [];
  const cur = facts.current;
  const prev = facts.previous;

  const apiPct = changePercent(cur.apiCostUsd, prev.apiCostUsd);
  const apiSev = severityFromIncrease(apiPct, 18, 30);
  if (apiSev !== "ok" && (apiPct ?? 0) > 0) {
    anomalies.push({
      id: "api_cost_spike",
      severity: apiSev,
      category: "api_cost",
      title: "API原価急増",
      detail: `前期比 ${apiPct}%（$${prev.apiCostUsd} → $${cur.apiCostUsd}）`,
      changePercent: apiPct,
    });
  }

  const visionPct = changePercent(cur.visionRequests, prev.visionRequests);
  const visionSev = severityFromIncrease(visionPct, 50, 100);
  if (visionSev !== "ok" && cur.visionRequests > 0 && (visionPct ?? 0) > 0) {
    anomalies.push({
      id: "vision_spike",
      severity: visionSev,
      category: "vision",
      title: "Vision利用急増",
      detail: `リクエスト前期比 ${visionPct}%（${prev.visionRequests} → ${cur.visionRequests}）`,
      changePercent: visionPct,
    });
  }

  const imagePct = changePercent(cur.imageGenCostUsd, prev.imageGenCostUsd);
  const imageSev = severityFromIncrease(imagePct, 40, 80);
  if (imageSev !== "ok" && cur.imageGenCostUsd > 0 && (imagePct ?? 0) > 0) {
    anomalies.push({
      id: "image_gen_cost",
      severity: imageSev,
      category: "image_generation",
      title: "画像生成コスト増加",
      detail: `前期比 ${imagePct}%（$${prev.imageGenCostUsd} → $${cur.imageGenCostUsd}）`,
      changePercent: imagePct,
    });
  }

  const outPct = changePercent(cur.avgOutputTokens, prev.avgOutputTokens);
  const outSev = severityFromIncrease(outPct, 40, 80);
  if (outSev !== "ok" && cur.avgOutputTokens > 0 && (outPct ?? 0) > 0) {
    anomalies.push({
      id: "response_bloat",
      severity: outSev,
      category: "response_bloat",
      title: "レスポンス肥大化",
      detail: `平均出力トークン前期比 ${outPct}%（${prev.avgOutputTokens} → ${cur.avgOutputTokens}）`,
      changePercent: outPct,
    });
  }

  const tokenPct = changePercent(
    cur.inputTokens + cur.outputTokens,
    prev.inputTokens + prev.outputTokens,
  );
  const tokenSev = severityFromIncrease(tokenPct, 35, 70);
  if (
    tokenSev !== "ok" &&
    cur.inputTokens + cur.outputTokens > 0 &&
    (tokenPct ?? 0) > 0
  ) {
    anomalies.push({
      id: "token_spike",
      severity: tokenSev,
      category: "token_spike",
      title: "異常トークン消費",
      detail: `総トークン前期比 ${tokenPct}%`,
      changePercent: tokenPct,
    });
  }

  let errorSev: AlertSeverity = "ok";
  if (cur.errorRatePercent >= 15) errorSev = "danger";
  else if (cur.errorRatePercent >= 5) errorSev = "watch";
  if (errorSev !== "ok") {
    anomalies.push({
      id: "error_rate",
      severity: errorSev,
      category: "error_rate",
      title: "エラー率増加",
      detail: `期間エラー率 ${cur.errorRatePercent}%`,
      changePercent: cur.errorRatePercent,
    });
  }

  return anomalies;
}

export function buildManagementAlerts(
  facts: AssistantFacts,
  anomalies: readonly CostAnomaly[],
): ManagementAlert[] {
  const alerts: ManagementAlert[] = anomalies.map((a) => ({
    id: a.id,
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    metric: a.changePercent != null ? `${a.changePercent}%` : null,
  }));

  if (facts.marginPercent != null) {
    if (facts.marginPercent >= 70) {
      alerts.push({
        id: "margin_ok",
        severity: "ok",
        title: "利益率改善 / 健全",
        detail: `利益率 ${facts.marginPercent}%`,
        metric: `${facts.marginPercent}%`,
      });
    } else if (facts.marginPercent < 40) {
      alerts.push({
        id: "margin_low",
        severity: "danger",
        title: "利益率低下",
        detail: `利益率 ${facts.marginPercent}%（目標目安 70%未満）`,
        metric: `${facts.marginPercent}%`,
      });
    } else if (facts.marginPercent < 60) {
      alerts.push({
        id: "margin_watch",
        severity: "watch",
        title: "利益率に注意",
        detail: `利益率 ${facts.marginPercent}%`,
        metric: `${facts.marginPercent}%`,
      });
    }
  }

  const apiPct = changePercent(
    facts.current.apiCostUsd,
    facts.previous.apiCostUsd,
  );
  if (apiPct != null && apiPct <= 5 && facts.current.apiCostUsd > 0) {
    alerts.push({
      id: "api_stable",
      severity: "ok",
      title: "APIコストは適正範囲",
      detail: `前期比 ${apiPct}%`,
      metric: `${apiPct}%`,
    });
  }

  // Deduplicate by id, keep highest severity
  const rank: Record<AlertSeverity, number> = { danger: 3, watch: 2, ok: 1 };
  const map = new Map<string, ManagementAlert>();
  for (const alert of alerts) {
    const existing = map.get(alert.id);
    if (!existing || rank[alert.severity] > rank[existing.severity]) {
      map.set(alert.id, alert);
    }
  }

  return [...map.values()].sort(
    (a, b) => rank[b.severity] - rank[a.severity],
  );
}
