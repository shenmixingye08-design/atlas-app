import { AssistantPeriodTabs } from "@/components/owner/ai-assistant/period-tabs";
import { RefreshAiButton } from "@/components/owner/ai-assistant/refresh-ai-button";
import { cn } from "@/lib/design-system/cn";
import type { AiAssistantSnapshot, AlertSeverity } from "@/lib/owner/ai-assistant";
import { formatOwnerDate, formatOwnerJpy, formatOwnerUsd } from "@/lib/owner/format";

function severityLabel(severity: AlertSeverity): string {
  if (severity === "danger") return "🔴 危険";
  if (severity === "watch") return "🟡 注意";
  return "🟢 正常";
}

function severityClass(severity: AlertSeverity): string {
  if (severity === "danger") {
    return "border-[var(--error)]/25 bg-[var(--error-bg)]";
  }
  if (severity === "watch") {
    return "border-[var(--warning)]/25 bg-[var(--warning-bg)]";
  }
  return "border-[var(--success)]/25 bg-[var(--success-bg)]";
}

export function AiAssistantDashboard({
  snapshot,
}: {
  snapshot: AiAssistantSnapshot;
}) {
  const highlightSims = snapshot.hqSimulations.filter(
    (row) =>
      (row.planId === "light" && (row.hqRuns === 5 || row.hqRuns === 10)) ||
      (row.planId === "standard" && row.hqRuns === 8) ||
      (row.planId === "premium" && row.hqRuns === 15),
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-caption tracking-[0.16em] text-[var(--text-muted)]">
            MINERVOT AI EXECUTIVE
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            AI経営アシスタント
          </h1>
          <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
            実データに基づく分析・異常検知・利益シミュレーション・将来予測。
            AI要約はオーナーの実行操作後に生成し、同一事実はキャッシュします。
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            更新 {formatOwnerDate(snapshot.generatedAt)} · hash {snapshot.factsHash}
            {snapshot.summary.cached ? " · キャッシュヒット" : ""}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <AssistantPeriodTabs period={snapshot.period} />
          <RefreshAiButton period={snapshot.period} />
        </div>
      </header>

      {snapshot.dataNotes.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
          {snapshot.dataNotes.join(" · ")}
        </div>
      )}

      <section className="owner-card-enter rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">経営サマリー</h2>
          <span className="text-xs text-[var(--text-muted)]">
            {snapshot.summary.source === "rules"
              ? "ルールベース"
              : snapshot.summary.source === "ai"
                ? "AI"
                : "ルール + AI"}
            {snapshot.summary.aiSkippedReason
              ? ` · ${snapshot.summary.aiSkippedReason}`
              : ""}
          </span>
        </div>
        {snapshot.summary.narrative && (
          <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
            {snapshot.summary.narrative}
          </p>
        )}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {snapshot.summary.bullets.map((bullet) => (
            <li
              key={bullet}
              className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm"
            >
              {bullet}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">経営アラート</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.alerts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">アラートなし</p>
          ) : (
            snapshot.alerts.map((alert) => (
              <article
                key={alert.id}
                className={cn(
                  "owner-card-enter rounded-2xl border p-4",
                  severityClass(alert.severity),
                )}
              >
                <p className="text-xs font-medium">
                  {severityLabel(alert.severity)}
                </p>
                <h3 className="mt-1 font-semibold">{alert.title}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {alert.detail}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">利益分析</h2>
          <ul className="mt-4 space-y-2">
            {snapshot.profitInsights.map((insight) => (
              <li
                key={insight.id}
                className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {insight.statement}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">コスト異常検知</h2>
          {snapshot.anomalies.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              異常は検出されていません
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {snapshot.anomalies.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-sm",
                    severityClass(item.severity),
                  )}
                >
                  <p className="font-medium">
                    {severityLabel(item.severity)} {item.title}
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">利益シミュレーター（高品質モード）</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          料金表ベースの自動計算（強モデル想定トークン）。ダミー値は使いません。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {highlightSims.map((row) => (
            <article
              key={`${row.planId}-${row.hqRuns}`}
              className={cn(
                "rounded-xl border px-4 py-4",
                row.isDeficit
                  ? "border-[var(--error)]/25 bg-[var(--error-bg)]"
                  : "border-[var(--border)] bg-[var(--surface-muted)]",
              )}
            >
              <p className="text-sm text-[var(--text-muted)]">
                {row.planName} ¥{row.planPriceJpy.toLocaleString("ja-JP")}
              </p>
              <p className="mt-1 text-lg font-semibold">
                高品質 {row.hqRuns} 回
              </p>
              <p className="mt-2 text-sm">{row.summary}</p>
            </article>
          ))}
        </div>
        {snapshot.priceScenarios.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">価格変更時の利益予測</h3>
            <ul className="mt-3 space-y-2">
              {snapshot.priceScenarios.slice(0, 9).map((row) => (
                <li
                  key={`${row.planId}-${row.proposedPriceJpy}`}
                  className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm"
                >
                  {row.summary}
                  {row.proposedMarginPercent != null
                    ? `（利益率 ${row.proposedMarginPercent}%）`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">プラン改善提案</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {snapshot.planProposals.map((plan) => (
            <article
              key={plan.planId}
              className="rounded-xl border border-[var(--border)] px-4 py-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{plan.planName}</h3>
                <span className="text-sm text-[var(--text-muted)]">
                  {plan.currentPriceJpy > 0
                    ? `¥${plan.currentPriceJpy.toLocaleString("ja-JP")}`
                    : "未定義"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                会員 {plan.subscribers}
                {plan.estimatedMarginPercent != null
                  ? ` · 利益率 ${plan.estimatedMarginPercent}%`
                  : ""}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                {plan.suggestions.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">ユーザー分析</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {snapshot.userInsights.map((row) => (
              <div
                key={row.id}
                className="rounded-xl bg-[var(--surface-muted)] px-3 py-3"
              >
                <dt className="text-xs text-[var(--text-muted)]">{row.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {row.value}
                </dd>
                {row.note && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{row.note}</p>
                )}
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">成果物品質分析</h2>
          {snapshot.qualityInsights.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">データなし</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {snapshot.qualityInsights.slice(0, 8).map((row) => (
                <li
                  key={row.featureId}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-sm",
                    severityClass(row.qualityFlag),
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-xs">{severityLabel(row.qualityFlag)}</span>
                  </div>
                  <p className="mt-1 text-[var(--text-secondary)]">{row.detail}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    生成 {row.generationCount}
                    {row.avgDurationMs != null
                      ? ` · 平均 ${(row.avgDurationMs / 1000).toFixed(1)}s`
                      : ""}
                    {row.avgCostUsd != null
                      ? ` · ${formatOwnerUsd(row.avgCostUsd, true)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">将来予測</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          観測された月次成長率のみを適用。不足時は未予測とします。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.forecasts.map((point) => (
            <article
              key={point.horizon}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4"
            >
              <p className="text-sm font-medium">{point.label}</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">売上</dt>
                  <dd className="tabular-nums">
                    {point.revenueJpy != null
                      ? formatOwnerJpy(point.revenueJpy)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">利益</dt>
                  <dd className="tabular-nums">
                    {point.profitJpy != null
                      ? formatOwnerJpy(point.profitJpy)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">API原価</dt>
                  <dd className="tabular-nums">
                    {point.apiCostJpy != null
                      ? formatOwnerJpy(point.apiCostJpy)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">ユーザー</dt>
                  <dd className="tabular-nums">
                    {point.users != null
                      ? point.users.toLocaleString("ja-JP")
                      : "—"}
                  </dd>
                </div>
              </dl>
              {point.note && (
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  {point.note}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">AI提案</h2>
        <ul className="mt-4 space-y-3">
          {snapshot.suggestions.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--border)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  {item.source === "ai" ? "AI" : "ルール"} · {item.priority}
                </span>
                <h3 className="font-medium">{item.title}</h3>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
