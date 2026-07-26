"use client";

import { useEffect, useState } from "react";

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

/**
 * Owner-only panel. Shows Planner/Writer/Reviewer/Judge timings,
 * improve count, quality score, and per-kind aggregates.
 */
export function QualityEnginePanel() {
  const [entries, setEntries] = useState<QualityEngineLogEntry[]>([]);
  const [byKind, setByKind] = useState<QualityKindStats[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Quality Engine</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          成果物専門AIの品質スコア・改善回数・Reviewer回数（一般ユーザーには非表示）
        </p>
      </div>

      {error && (
        <Card padding="md">
          <p className="text-sm text-[var(--status-error)]">{error}</p>
        </Card>
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
                  <th className="px-3 py-2 font-medium">観点</th>
                  <th className="px-3 py-2 font-medium">スコア</th>
                  <th className="px-3 py-2 font-medium">改善</th>
                  <th className="px-3 py-2 font-medium">Reviewer</th>
                  <th className="px-3 py-2 font-medium">Planner</th>
                  <th className="px-3 py-2 font-medium">Writer</th>
                  <th className="px-3 py-2 font-medium">Judge</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr
                    key={`${entry.recordedAt}-${index}`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                      {new Date(entry.recordedAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2">
                      {entry.specialistLabel ?? entry.promptKind}
                    </td>
                    <td className="px-3 py-2">{entry.judgeFocus ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {entry.finalScore ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {entry.improveCount}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {entry.reviewerCount ?? (entry.reviewerUsedLlm ? 2 : 1)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {entry.timings.plannerMs}ms
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {entry.timings.writerMs}ms
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {entry.timings.judgeMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
