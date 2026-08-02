"use client";

import type { MemoryQualityDashboard } from "@/lib/personal-memory/quality/types";
import { MemoryApplyPreview } from "@/components/personal-memory/memory-apply-preview";
import type { MemoryApplyPreviewItem } from "@/lib/personal-memory/types";

const KIND_LABELS: Record<string, string> = {
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
  pdf: "PDF",
  image: "画像解析",
  ocr: "OCR",
  text: "テキスト",
  unknown: "その他",
};

function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function scoreText(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function MemoryQualityDashboardPanel({
  dashboard,
  applyPreview,
}: {
  dashboard: MemoryQualityDashboard | null;
  applyPreview: MemoryApplyPreviewItem[];
}) {
  if (!dashboard) {
    return (
      <section className="rounded-2xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
        Memory Score の計測データがまだありません。成果物を修正すると数値で品質が記録されます。
      </section>
    );
  }

  const proof = dashboard.proof;
  const hasProof =
    proof.categoriesMeasured > 0 &&
    proof.averageScoreLift != null &&
    proof.averageScoreLift > 0 &&
    proof.averageDiffRateDrop != null &&
    proof.averageDiffRateDrop > 0;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">Memory Score</h2>
        <p className="text-3xl font-semibold tracking-tight text-[var(--brand)]">
          {dashboard.latestScore?.label ?? "計測前"}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          平均 {scoreText(dashboard.averageScore)} · 評価{" "}
          {dashboard.evaluationsCount} 件
        </p>
        {hasProof ? (
          <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            学習証明: カテゴリ平均で Score +
            {Math.round(proof.averageScoreLift ?? 0)}pt / Diff率 −
            {pct(proof.averageDiffRateDrop)}（
            {proof.categoriesImproved}/{proof.categoriesMeasured} カテゴリ改善）
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            同一カテゴリで2回以上評価されると、Score上昇とDiff率低下を数値で証明します。
          </p>
        )}
      </section>

      <MemoryApplyPreview items={applyPreview} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard
          label="成果物一致率"
          value={pct(dashboard.averageMatchRate)}
        />
        <MetricCard
          label="修正率 (Diff)"
          value={pct(dashboard.averageDiffRate)}
        />
        <MetricCard
          label="Confidence"
          value={pct(dashboard.averageConfidence)}
        />
        <MetricCard
          label="適用 Memory"
          value={String(dashboard.applyRate.totalApplied)}
        />
        <MetricCard
          label="カテゴリ適用"
          value={String(dashboard.applyRate.byCategory)}
        />
        <MetricCard
          label="Automation適用"
          value={String(dashboard.applyRate.byAutomation)}
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">成果物一致率（次元別）</h2>
        <ul className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(
            [
              ["writing_style", "文体"],
              ["structure", "構成"],
              ["length", "長さ"],
              ["layout", "レイアウト"],
              ["destination", "保存先"],
              ["format", "形式"],
              ["template", "テンプレート"],
            ] as const
          ).map(([key, label]) => (
            <li
              key={key}
              className="rounded-xl bg-[var(--surface-muted)] px-3 py-2"
            >
              <p className="text-[var(--text-muted)]">{label}</p>
              <p className="font-medium">{pct(dashboard.matchRates[key])}</p>
            </li>
          ))}
        </ul>
      </section>

      {dashboard.recentLearned.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">最近覚えたこと</h2>
          <ul className="space-y-2 text-sm">
            {dashboard.recentLearned.map((item, idx) => (
              <li
                key={`${item.title}-${item.updatedAt}-${idx}`}
                className="flex items-start justify-between gap-3"
              >
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-[var(--text-secondary)]">{item.summary}</p>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                  {item.status === "active" ? "正式" : "候補"} ·{" "}
                  {Math.round(item.confidence * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.improvementSuggestions.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">改善提案（Memory不足時のみ）</h2>
          <ul className="space-y-3 text-sm">
            {dashboard.improvementSuggestions.map((s) => (
              <li key={s.id}>
                <p className="font-medium">{s.title}</p>
                <p className="text-[var(--text-secondary)]">{s.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.learningVelocity.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">学習速度（カテゴリ別）</h2>
          {dashboard.learningVelocity.map((series) => (
            <div key={series.workCategory} className="space-y-1">
              <p className="text-xs font-medium">
                {series.workCategory}
                {series.runsToStable
                  ? ` · ${series.runsToStable}回で安定`
                  : " · まだ安定前"}
              </p>
              <ol className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                {series.points.map((p) => (
                  <li
                    key={`${series.workCategory}-${p.runIndex}`}
                    className="rounded-lg bg-[var(--surface-muted)] px-2 py-1"
                  >
                    {p.runIndex}回目 {p.memoryScore}% / Diff{" "}
                    {pct(p.diffRate)}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}

      {dashboard.byDeliverableKind.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">成果物別</h2>
          <ul className="space-y-2 text-xs">
            {dashboard.byDeliverableKind.map((row) => (
              <li
                key={row.kind}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2"
              >
                <span className="font-medium">
                  {KIND_LABELS[row.kind] ?? row.kind}
                </span>
                <span className="text-[var(--text-secondary)]">
                  Score {scoreText(row.averageScore)} · 一致{" "}
                  {pct(row.averageMatchRate)} · Diff {pct(row.averageDiffRate)}{" "}
                  · Conf {pct(row.averageConfidence)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.byAutomation.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Automation別学習</h2>
          <ul className="space-y-2 text-xs">
            {dashboard.byAutomation.map((row) => (
              <li
                key={row.automationId}
                className="flex justify-between gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2"
              >
                <span className="truncate font-medium">{row.automationId}</span>
                <span>
                  Score {scoreText(row.averageScore)} · Diff{" "}
                  {pct(row.averageDiffRate)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
