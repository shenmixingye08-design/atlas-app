"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import type {
  QualityEngineTelemetry,
  QualityKindStats,
} from "@/lib/quality-engine/types";
import { Card } from "@/components/ui/card";

type QualityEngineLogEntry = QualityEngineTelemetry & {
  userId: string | null;
  assignmentHint: string;
};

type ApiResponse = {
  entries: QualityEngineLogEntry[];
  byKind?: QualityKindStats[];
};

function pct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function formatCost(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "未計測";
  if (value === 0) return "0";
  return `$${value.toFixed(6)}`;
}

/**
 * Owner-only panel. Shows Planner/Writer/Reviewer/Judge timings,
 * improve count, quality score, Knowledge / Smart Context usage.
 */
export function QualityEnginePanel() {
  const [entries, setEntries] = useState<QualityEngineLogEntry[]>([]);
  const [byKind, setByKind] = useState<QualityKindStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedAt, setExpandedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/owner/quality-engine?limit=200", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        return (await res.json()) as ApiResponse;
      })
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries ?? []);
          setByKind(data.byKind ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("品質ログを取得できませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const knowledgeStats = useMemo(() => {
    const withUsage = entries.filter((e) => e.knowledgeUsage);
    const n = withUsage.length;
    if (n === 0) return null;
    const count = (key: "businessProfile" | "reference" | "template" | "knowledge") =>
      withUsage.filter((e) => e.knowledgeUsage?.[key]).length;
    const avgContext = Math.round(
      withUsage.reduce((s, e) => s + (e.knowledgeUsage?.contextChars ?? 0), 0) / n,
    );
    return {
      n,
      businessProfile: count("businessProfile"),
      reference: count("reference"),
      template: count("template"),
      knowledge: count("knowledge"),
      avgContext,
    };
  }, [entries]);

  const smartStats = useMemo(() => {
    const withSc = entries.filter((e) => e.smartContext);
    const n = withSc.length;
    if (n === 0) return null;
    const avg = (fn: (e: QualityEngineLogEntry) => number) =>
      Math.round(withSc.reduce((s, e) => s + fn(e), 0) / n);
    return {
      n,
      avgCandidates: avg((e) => e.smartContext?.candidateCount ?? 0),
      avgSelected: avg((e) => e.smartContext?.selectedCount ?? 0),
      avgExcluded: avg((e) => e.smartContext?.excludedCount ?? 0),
      avgBudget: avg((e) => e.smartContext?.budgetTokens ?? 0),
      avgEstTokens: avg((e) => e.smartContext?.estimatedInputTokens ?? 0),
      avgReduction: avg((e) => e.smartContext?.reductionRate ?? 0),
      cacheHits: withSc.filter((e) => e.smartContext?.cacheHit).length,
      avgExtraLlm: avg((e) => e.smartContext?.extraLlmCalls ?? 0),
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Quality Engine</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          成果物専門AI・Knowledge / Smart Context Engine の品質・コスト指標（一般ユーザーには非表示）
        </p>
      </div>

      {error && (
        <Card padding="md">
          <p className="text-sm text-[var(--status-error)]">{error}</p>
        </Card>
      )}

      {!error && knowledgeStats && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">
            Knowledge 利用状況
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">指標</th>
                  <th className="px-3 py-2 font-medium">値</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">Business Profile使用</td>
                  <td className="px-3 py-2 tabular-nums">
                    {pct(knowledgeStats.businessProfile, knowledgeStats.n)}（
                    {knowledgeStats.businessProfile}/{knowledgeStats.n}）
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">Reference使用</td>
                  <td className="px-3 py-2 tabular-nums">
                    {pct(knowledgeStats.reference, knowledgeStats.n)}（
                    {knowledgeStats.reference}/{knowledgeStats.n}）
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">Template使用</td>
                  <td className="px-3 py-2 tabular-nums">
                    {pct(knowledgeStats.template, knowledgeStats.n)}（
                    {knowledgeStats.template}/{knowledgeStats.n}）
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">Knowledge使用</td>
                  <td className="px-3 py-2 tabular-nums">
                    {pct(knowledgeStats.knowledge, knowledgeStats.n)}（
                    {knowledgeStats.knowledge}/{knowledgeStats.n}）
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均Contextサイズ</td>
                  <td className="px-3 py-2 tabular-nums">
                    {knowledgeStats.avgContext.toLocaleString()} 文字
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!error && smartStats && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">
            Smart Context Engine
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">指標</th>
                  <th className="px-3 py-2 font-medium">値</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均 Context候補数</td>
                  <td className="px-3 py-2 tabular-nums">{smartStats.avgCandidates}</td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均 採用Context数</td>
                  <td className="px-3 py-2 tabular-nums">{smartStats.avgSelected}</td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均 除外Context数</td>
                  <td className="px-3 py-2 tabular-nums">{smartStats.avgExcluded}</td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均 Context予算</td>
                  <td className="px-3 py-2 tabular-nums">
                    {smartStats.avgBudget.toLocaleString()} tokens
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均 推定入力トークン</td>
                  <td className="px-3 py-2 tabular-nums">
                    {smartStats.avgEstTokens.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">平均 圧縮削減率</td>
                  <td className="px-3 py-2 tabular-nums">{smartStats.avgReduction}%</td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">キャッシュ利用</td>
                  <td className="px-3 py-2 tabular-nums">
                    {pct(smartStats.cacheHits, smartStats.n)}（
                    {smartStats.cacheHits}/{smartStats.n}）
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">追加LLM呼び出し数（選択）</td>
                  <td className="px-3 py-2 tabular-nums">
                    {smartStats.avgExtraLlm}（通常 0）
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!error && byKind.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">
            成果物ごとの品質
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">専門AI</th>
                  <th className="px-3 py-2 font-medium">種類</th>
                  <th className="px-3 py-2 font-medium">件数</th>
                  <th className="px-3 py-2 font-medium">平均スコア</th>
                  <th className="px-3 py-2 font-medium">平均改善回数</th>
                  <th className="px-3 py-2 font-medium">平均Reviewer回数</th>
                </tr>
              </thead>
              <tbody>
                {byKind.map((row) => (
                  <tr
                    key={row.promptKind}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-3 py-2">{row.specialistLabel}</td>
                    <td className="px-3 py-2">{row.promptKind}</td>
                    <td className="px-3 py-2 tabular-nums">{row.sampleCount}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {row.avgScore ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.avgImproveCount}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.avgReviewerCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!error && entries.length === 0 && (
        <Card padding="md">
          <p className="text-sm text-[var(--text-muted)]">
            まだ品質エンジンの実行ログがありません。
          </p>
        </Card>
      )}

      {entries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">直近ログ</h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">時刻</th>
                  <th className="px-3 py-2 font-medium">専門AI</th>
                  <th className="px-3 py-2 font-medium">スコア</th>
                  <th className="px-3 py-2 font-medium">改善</th>
                  <th className="px-3 py-2 font-medium">候補/採用/除外</th>
                  <th className="px-3 py-2 font-medium">予算</th>
                  <th className="px-3 py-2 font-medium">推定tok</th>
                  <th className="px-3 py-2 font-medium">圧縮</th>
                  <th className="px-3 py-2 font-medium">Cache</th>
                  <th className="px-3 py-2 font-medium">追加LLM</th>
                  <th className="px-3 py-2 font-medium">原価</th>
                  <th className="px-3 py-2 font-medium">詳細</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const sc = entry.smartContext;
                  const key = `${entry.recordedAt}-${index}`;
                  const open = expandedAt === key;
                  return (
                    <Fragment key={key}>
                      <tr className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                          {new Date(entry.recordedAt).toLocaleString("ja-JP")}
                        </td>
                        <td className="px-3 py-2">
                          {entry.specialistLabel ?? entry.promptKind}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-medium">
                          {entry.finalScore ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {entry.improveCount}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {sc
                            ? `${sc.candidateCount}/${sc.selectedCount}/${sc.excludedCount}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {sc?.budgetTokens?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {sc?.estimatedInputTokens?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {sc
                            ? `${sc.preCompressChars}→${sc.postCompressChars} (${sc.reductionRate}%)`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {sc ? (sc.cacheHit ? "✓" : "—") : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {sc?.extraLlmCalls ?? 0}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCost(sc?.estimatedApiCostUsd)}
                        </td>
                        <td className="px-3 py-2">
                          {sc?.decisions?.length ? (
                            <button
                              type="button"
                              className="text-[var(--accent)] underline-offset-2 hover:underline"
                              onClick={() =>
                                setExpandedAt(open ? null : key)
                              }
                            >
                              {open ? "閉じる" : "採用/除外"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                      {open && sc?.decisions && (
                        <tr className="border-t border-[var(--border)] bg-[var(--surface-muted)]">
                          <td colSpan={12} className="px-3 py-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
                                  採用
                                </p>
                                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                                  {sc.decisions
                                    .filter((d) => d.selected)
                                    .map((d) => (
                                      <li key={d.id}>
                                        <span className="font-medium">
                                          {d.title}
                                        </span>
                                        {" — "}
                                        {d.reasons.join(", ") || "—"}
                                      </li>
                                    ))}
                                </ul>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
                                  除外
                                </p>
                                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                                  {sc.decisions
                                    .filter((d) => !d.selected)
                                    .map((d) => (
                                      <li key={d.id}>
                                        <span className="font-medium">
                                          {d.title}
                                        </span>
                                        {" — "}
                                        {d.exclusionReasons.join(", ") ||
                                          "low_relevance"}
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                              必須 {sc.requiredCount} / 選択 {sc.selectionMs}ms /
                              Ref {sc.usedReferenceCount} / Past{" "}
                              {sc.usedPastArtifactCount} / AI呼び出し{" "}
                              {sc.aiCallCount || 0} / 実入力tok{" "}
                              {sc.actualInputTokens || 0} / 出力tok{" "}
                              {sc.outputTokens || 0} / モデル{" "}
                              {sc.model || "未計測"}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
