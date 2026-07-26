import Link from "next/link";

import { OwnerRefreshControl } from "@/components/owner/owner-refresh-control";
import { ExecutiveMetricCard } from "@/components/owner/executive/metric-card";
import { ExecutiveSeriesChart } from "@/components/owner/executive/series-chart";
import { formatOwnerDate, formatOwnerUsd } from "@/lib/owner/format";
import type { ExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { cn } from "@/lib/design-system/cn";

function statusDot(status: "running" | "idle" | "error") {
  if (status === "running") return "bg-[var(--success)]";
  if (status === "error") return "bg-[var(--error)]";
  return "bg-[var(--warning)]";
}

export function ExecutiveDashboard({
  snapshot,
}: {
  snapshot: ExecutiveDashboardSnapshot;
}) {
  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-caption tracking-[0.16em] text-[var(--text-muted)]">
            MINERVOT EXECUTIVE
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            経営ダッシュボード
          </h1>
          <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
            オーナー専用。Supabase / Stripe / OpenAI / ジョブ / 成果物の実データのみを表示します。推定値やデモ値は使いません。
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            最終更新 {formatOwnerDate(snapshot.generatedAt)}
            {snapshot.ownerEmails.length > 0
              ? ` · 管理者 ${snapshot.ownerEmails.length} 名（ATLAS_OWNER_EMAILS）`
              : null}
          </p>
        </div>
        <OwnerRefreshControl />
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {snapshot.kpis.map((card, index) => (
          <ExecutiveMetricCard key={card.id} card={card} index={index} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">AI原価（モデル別）</h2>
            <Link
              href="/owner/ai-cost"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              詳細
            </Link>
          </div>
          {snapshot.aiByModel.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">利用データなし</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {snapshot.aiByModel.slice(0, 6).map((row) => (
                <li
                  key={row.model}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{row.displayName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {row.requests}回 · in {row.inputTokens.toLocaleString("ja-JP")} / out{" "}
                      {row.outputTokens.toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">
                    {formatOwnerUsd(row.costUsd, true)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">AI部署モニター</h2>
            <Link
              href="/owner/departments"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              詳細
            </Link>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {snapshot.departments.map((dept) => (
              <li
                key={dept.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full",
                      statusDot(dept.status),
                    )}
                  />
                  <span className="font-medium">{dept.label}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {dept.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  処理 {dept.processedCount} · Queue {dept.queueCount}
                  {dept.avgDurationMs != null
                    ? ` · 平均 ${(dept.avgDurationMs / 1000).toFixed(1)}s`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">ジョブ監視</h2>
            <Link href="/owner/jobs" className="text-sm text-[var(--accent)] hover:underline">
              一覧
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["処理中", snapshot.jobs.counts.running],
                ["待機", snapshot.jobs.counts.queued],
                ["失敗", snapshot.jobs.counts.failed],
                ["完了", snapshot.jobs.counts.completed],
              ] as const
            ).map(([label, count]) => (
              <div
                key={label}
                className="rounded-xl bg-[var(--surface-muted)] px-3 py-4 text-center"
              >
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">APIコストログ</h2>
            <Link
              href="/owner/api-cost-log"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              詳細
            </Link>
          </div>
          {snapshot.apiCostLog.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">記録なし</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {snapshot.apiCostLog.slice(0, 4).map((row) => (
                <li
                  key={row.featureId}
                  className="rounded-xl border border-[var(--border)] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{row.label}</p>
                    <p className="font-semibold tabular-nums">
                      {formatOwnerUsd(row.totalCostUsd, true)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    {row.models.slice(0, 4).map((model) => (
                      <span key={model.model}>
                        {model.displayName} {formatOwnerUsd(model.costUsd, true)}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ExecutiveSeriesChart series={snapshot.series} title="分析推移" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/owner/ai-assistant", label: "AI経営アシスタント" },
          { href: "/owner/users", label: "ユーザー管理" },
          { href: "/owner/stripe", label: "Stripe管理" },
          { href: "/owner/error-monitoring", label: "エラーセンター" },
          { href: "/owner/system-status", label: "システム監視" },
          { href: "/owner/profit-analysis", label: "利益分析" },
          { href: "/owner/deliverable-cost", label: "成果物原価" },
          { href: "/owner/analytics", label: "日次・週次・月次・年次" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-sm font-medium transition-colors hover:bg-[var(--surface-muted)]"
          >
            {link.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
